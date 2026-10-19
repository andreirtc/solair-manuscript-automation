/* Shared Google Docs planner. No credentials, network calls or persistent state. */
var Solair = (function () {
  "use strict";
  const TEXT_FIELDS = [
    "bold",
    "italic",
    "underline",
    "strikethrough",
    "smallCaps",
    "backgroundColor",
    "foregroundColor",
    "fontSize",
    "weightedFontFamily",
    "baselineOffset",
    "link",
  ];
  const PARAGRAPH_FIELDS = [
    "alignment",
    "lineSpacing",
    "spaceAbove",
    "spaceBelow",
    "indentFirstLine",
    "indentStart",
    "indentEnd",
    "keepWithNext",
    "keepLinesTogether",
    "avoidWidowAndOrphan",
  ];
  function fail(message) {
    throw new Error(message);
  }
  function normalize(result) {
    const d = result.structuredContent || result;
    const tabs = [];
    function walk(items) {
      (items || []).forEach((t) => {
        const p = t.tabProperties || t;
        const tab = Object.assign({}, t.documentTab || t, {
          tabId: p.tabId,
          title: p.title,
        });
        // Native Docs groups same-name ranges; the connector may already flatten them.
        const ranges = {};
        Object.entries(tab.namedRanges || {}).forEach(([key, value]) => {
          if (Array.isArray(value.namedRanges))
            value.namedRanges.forEach((range, i) => {
              ranges[range.namedRangeId || key + ":" + i] = range;
            });
          else ranges[key] = value;
        });
        tab.namedRanges = ranges;
        tabs.push(tab);
        walk(t.childTabs);
      });
    }
    walk(d.tabs);
    return Object.assign({}, d, { tabs });
  }
  function paragraphs(tab) {
    const result = [];
    function walk(content, location) {
      (content || []).forEach((e) => {
        if (e.paragraph)
          result.push({
            start: e.startIndex,
            end: e.endIndex,
            text: (e.paragraph.elements || [])
              .map((x) => (x.textRun ? x.textRun.content : "\uFFFC"))
              .join(""),
            paragraph: e.paragraph,
            location: location || null,
          });
        if (e.table)
          e.table.tableRows.forEach((r, ri) =>
            r.tableCells.forEach((c, ci) =>
              walk(c.content, {
                tableStart: e.startIndex,
                row: ri,
                column: ci,
                cell: c,
              }),
            ),
          );
      });
    }
    walk(tab.body && tab.body.content);
    return result;
  }
  function protectedSection(ps) {
    const starts = ps.filter(
      (p) => !p.location && p.text.trim() === "Statement of the Problem",
    );
    if (starts.length !== 1)
      fail("Cannot uniquely locate the finalized Statement of the Problem.");
    const start = starts[0].start;
    const end = ps.find(
      (p) =>
        !p.location &&
        p.start > start &&
        /^Scope and Limitations(?: of the Study)?$/.test(p.text.trim()),
    );
    if (!end) fail("Cannot locate the end of the protected SOP section.");
    return { start, end: end.start };
  }
  function checkedParagraph(p, sop, allowEquationNarrative) {
    if (p.start < sop.end && p.end > sop.start)
      fail("The finalized SOP section is protected.");
    if (
      p.paragraph.elements.some(
        (e) =>
          (!e.textRun &&
            !(
              allowEquationNarrative &&
              e.equation &&
              Number.isInteger(e.startIndex) &&
              Number.isInteger(e.endIndex)
            )) ||
          (e.textRun && /[\uE000-\uF8FF]/.test(e.textRun.content)),
      )
    )
      fail(
        "The paragraph contains a native object or opaque control; preserve it.",
      );
    if (
      p.paragraph.elements.some(
        (e) =>
          e.suggestedInsertionIds ||
          e.suggestedDeletionIds ||
          (e.textRun && e.textRun.suggestedTextStyleChanges),
      )
    )
      fail("Resolve suggestions before updating this paragraph.");
  }
  function styleAt(tab, p, index) {
    const normal =
      ((tab.namedStyles || {}).styles || []).find(
        (s) =>
          s.namedStyleType ===
          (p.paragraph.paragraphStyle || {}).namedStyleType,
      ) || {};
    const run = p.paragraph.elements.find(
      (e) => e.textRun && e.startIndex <= index && e.endIndex > index,
    );
    const combined = Object.assign(
      {},
      normal.textStyle || {},
      (run && run.textRun.textStyle) || {},
    );
    const result = {};
    TEXT_FIELDS.forEach((k) => {
      if (k in combined) result[k] = combined[k];
    });
    return result;
  }
  function markerName(job) {
    return "SOLAIR_JOB_" + job.job_id;
  }
  function sameStyle(actual, expected) {
    if (expected && typeof expected === "object")
      return Object.keys(expected).every((k) =>
        sameStyle(
          actual && actual[k] !== undefined
            ? actual[k]
            : k === "magnitude"
              ? 0
              : undefined,
          expected[k],
        ),
      );
    return actual === expected;
  }
  function alreadyApplied(tab, job) {
    return Object.values(tab.namedRanges || {}).some(
      (n) => n.name === markerName(job),
    );
  }
  function plan(raw, job, config) {
    const d = normalize(raw);
    if (
      job.schema_version !== 1 ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(job.job_id || "")
    )
      fail("Invalid job schema or job ID.");
    if (
      job.document_id !== config.document_id ||
      d.documentId !== config.document_id ||
      job.tab_id !== config.tab_id
    )
      fail("Job does not match the configured manuscript and tab.");
    const tab = d.tabs.find((t) => t.tabId === config.tab_id);
    if (!tab || tab.title !== config.tab_title)
      fail("Manuscript tab identity changed.");
    if (!d.revisionId) fail("A current revision ID is required.");
    if (alreadyApplied(tab, job))
      return {
        status: "already_applied",
        document_id: d.documentId,
        requests: [],
      };
    if (
      !Array.isArray(job.operations) ||
      !job.operations.length ||
      job.operations.length > 25
    )
      fail("A job needs 1–25 operations.");
    const ps = paragraphs(tab),
      sop = protectedSection(ps),
      edits = [];
    job.operations.forEach((op) => {
      if (typeof op.evidence !== "string" || !op.evidence.trim())
        fail("Every operation needs an evidence or user-request reference.");
      if (op.type === "replace_text") {
        if (
          !op.before ||
          typeof op.after !== "string" ||
          /[\n\r\uFFFC\uE000-\uF8FF]/.test(op.before + op.after)
        )
          fail("Text updates must stay inside one plain paragraph.");
        let candidates = ps.filter(
          (p) =>
            p.text.includes(op.before) &&
            (op.expected_start === undefined || p.start === op.expected_start),
        );
        if (op.cell)
          candidates = candidates.filter(
            (p) =>
              p.location &&
              p.location.row === op.cell.row &&
              p.location.column === op.cell.column &&
              (!op.cell.table_anchor ||
                paragraphs(tab).some(
                  (a) =>
                    !a.location &&
                    a.text.trim() === op.cell.table_anchor &&
                    a.end <= p.location.tableStart &&
                    !ps.some(
                      (b) =>
                        !b.location &&
                        b.start > a.end &&
                        b.start < p.location.tableStart &&
                        b.text.trim().startsWith("Table "),
                    ),
                )),
          );
        if (candidates.length !== 1)
          fail(
            "Expected text is missing or ambiguous: " + op.before.slice(0, 60),
          );
        const p = candidates[0];
        checkedParagraph(p, sop, true);
        if (p.text.indexOf(op.before) !== p.text.lastIndexOf(op.before))
          fail("Text appears twice in the same paragraph.");
        if (op.before === op.after) fail("No-op replacement.");
        // Change the smallest span, so inline emphasis outside that span stays intact.
        let a = 0,
          b = 0;
        while (
          a < Math.min(op.before.length, op.after.length) &&
          op.before[a] === op.after[a]
        )
          a++;
        while (
          b < Math.min(op.before.length - a, op.after.length - a) &&
          op.before[op.before.length - 1 - b] ===
            op.after[op.after.length - 1 - b]
        )
          b++;
        // Keep surrogate pairs together at both boundaries.
        if (a && /[\uD800-\uDBFF]/.test(op.before[a - 1])) a--;
        if (b && /[\uDC00-\uDFFF]/.test(op.before[op.before.length - b])) b--;
        const hasEquation = p.paragraph.elements.some((e) => e.equation);
        const containingRuns = hasEquation
          ? p.paragraph.elements.filter(
              (e) => e.textRun && e.textRun.content.includes(op.before),
            )
          : [];
        if (hasEquation && containingRuns.length !== 1)
          fail(
            "Changes next to equations must remain within one exact text run; the formula itself is protected.",
          );
        const start = hasEquation
            ? containingRuns[0].startIndex +
              containingRuns[0].textRun.content.indexOf(op.before) +
              a
            : p.start + p.text.indexOf(op.before) + a,
          end = start + op.before.length - a - b;
        const inserted = op.after.slice(a, op.after.length - b);
        if (
          p.paragraph.elements.some(
            (e) =>
              !e.textRun &&
              e.endIndex > start &&
              e.startIndex < Math.max(end, start + 1),
          )
        )
          fail(
            "Cannot replace across native equations or objects; direct native equation editing is unsupported.",
          );
        const runs = p.paragraph.elements.filter(
          (e) =>
            e.textRun &&
            e.endIndex > start &&
            e.startIndex < Math.max(end, start + 1),
        );
        let labelStyles;
        if (new Set(runs.map((e) => JSON.stringify(e.textRun.textStyle || {}))).size > 1) {
          // A plain bold leading term followed by one regular explanation is a
          // common thesis paragraph. Preserve these two roles explicitly rather
          // than inheriting bold across the replacement or flattening emphasis.
          const allRuns = p.paragraph.elements.filter(e => e.textRun);
          const base = style => JSON.stringify(Object.entries(style || {}).filter(([key]) => key !== "bold").sort(([a],[b]) => a.localeCompare(b)));
          const lead = allRuns[0], body = allRuns.slice(1);
          const prefix = op.after.match(/^.{1,180}?\.\s+/u)?.[0];
          if (hasEquation || p.text.trim() !== op.before || !lead?.textRun.textStyle?.bold || !/\.\s+$/.test(lead.textRun.content) || !body.length || !prefix || body.some(e => e.textRun.textStyle?.bold || base(e.textRun.textStyle) !== base(lead.textRun.textStyle)))
            fail("Changed span crosses unsupported text styles; the paragraph needs a smaller reviewed edit.");
          labelStyles = [
            { offset: 0, length: prefix.length, style: Object.assign({}, styleAt(tab,p,lead.startIndex), {bold:true}) },
            { offset: prefix.length, length: op.after.length-prefix.length, style: Object.assign({}, styleAt(tab,p,body[0].startIndex), {bold:false}) },
          ];
        }
        const requests = [];
        if (end > start)
          requests.push({
            deleteContentRange: {
              range: { startIndex: start, endIndex: end, tabId: tab.tabId },
            },
          });
        if (inserted) {
          requests.push({
            insertText: {
              location: { index: start, tabId: tab.tabId },
              text: inserted,
            },
          });
          requests.push({
            updateTextStyle: {
              range: {
                startIndex: start,
                endIndex: start + inserted.length,
                tabId: tab.tabId,
              },
              textStyle: labelStyles ? labelStyles[1].style : styleAt(tab, p, start),
              fields: TEXT_FIELDS.join(","),
            },
          });
        }
        if (inserted && labelStyles) {
          const labelEnd = Math.min(start + inserted.length, p.start + labelStyles[0].length);
          if (labelEnd > start) requests.push({updateTextStyle:{range:{startIndex:start,endIndex:labelEnd,tabId:tab.tabId},textStyle:labelStyles[0].style,fields:TEXT_FIELDS.join(",")}});
        }
        edits.push({
          start,
          end,
          delta: op.after.length - op.before.length,
          requests,
          summary: {
            type: op.type,
            paragraph_start: p.start,
            changed_offset: start - p.start,
            removed_length: end - start,
            inserted_length: inserted.length,
            before: op.before,
            after: op.after,
            expected_paragraph_after: p.text.replace(op.before, op.after),
            expected_text_styles: labelStyles,
            evidence: op.evidence,
          },
        });
      } else if (op.type === "format_paragraph") {
        const matches = ps.filter(
          (p) =>
            !p.location &&
            p.text.trim() === op.expected_text &&
            (op.expected_start === undefined || p.start === op.expected_start),
        );
        if (matches.length !== 1)
          fail("Formatting paragraph is missing or ambiguous.");
        const p = matches[0];
        checkedParagraph(p, sop);
        if (
          !op.paragraph_style ||
          !Object.keys(op.paragraph_style).length ||
          Object.keys(op.paragraph_style).some(
            (k) => !PARAGRAPH_FIELDS.includes(k),
          )
        )
          fail("Unsupported paragraph formatting field.");
        const requests = [
          {
            updateParagraphStyle: {
              range: { startIndex: p.start, endIndex: p.end, tabId: tab.tabId },
              paragraphStyle: op.paragraph_style,
              fields: Object.keys(op.paragraph_style).join(","),
            },
          },
        ];
        if (op.text_style) {
          if (
            !Object.keys(op.text_style).length ||
            Object.keys(op.text_style).some(
              (k) => !["weightedFontFamily", "fontSize"].includes(k),
            )
          )
            fail(
              "Only font family and size are supported by this formatting operation.",
            );
          requests.push({
            updateTextStyle: {
              range: {
                startIndex: p.start,
                endIndex: p.end - 1,
                tabId: tab.tabId,
              },
              textStyle: op.text_style,
              fields: Object.keys(op.text_style).join(","),
            },
          });
        }
        edits.push({
          start: p.start,
          end: p.end,
          requests,
          summary: {
            type: op.type,
            paragraph_start: p.start,
            text: op.expected_text,
            paragraph_style: op.paragraph_style,
            text_style: op.text_style,
            evidence: op.evidence,
          },
        });
      } else if (op.type === "replace_figure") {
        const matches = ps.filter(
          (p) =>
            !p.location &&
            p.text === "\uFFFC\n" &&
            p.paragraph.elements.some(
              (e) => e.inlineObjectElement?.inlineObjectId === op.old_image_id,
            ),
        );
        if (matches.length !== 1)
          fail(
            "The figure object is missing or ambiguous. Refresh the figure inventory.",
          );
        const p = matches[0],
          element = p.paragraph.elements.find((e) => e.inlineObjectElement),
          caption = ps.find(
            (q) =>
              !q.location &&
              q.start === op.expected_caption_start &&
              q.text.trim() === op.expected_caption &&
              q.end === p.start,
          );
        if (!caption) fail("The expected figure caption or placement changed.");
        checkedParagraph(caption, sop);
        if (p.start < sop.end && p.end > sop.start)
          fail("The finalized SOP section is protected.");
        if (
          p.paragraph.elements.some(
            (e) => e.suggestedInsertionIds || e.suggestedDeletionIds,
          )
        )
          fail("Resolve figure suggestions first.");
        if (
          !op.caption ||
          /[\r\n]/.test(op.caption) ||
          !op.uri ||
          !/^[A-Za-z0-9_-]+$/.test(op.asset_id || "") ||
          !op.caption_style ||
          !op.image_style ||
          !op.caption_text_style
        )
          fail(
            "A replacement needs a reviewed private source, caption, dimensions and sampled styles.",
          );
        if (
          ps.some(
            (q) => q.start !== caption.start && q.text.trim() === op.caption,
          )
        )
          fail("The replacement caption duplicates another figure.");
        if (
          Object.values(tab.namedRanges || {}).some(
            (n) => n.name === "SOLAIR_ASSET_" + op.asset_id,
          )
        )
          fail("This source already belongs to an inserted figure.");
        if (
          !(
            op.width_pt > 0 &&
            op.width_pt <= 432 &&
            op.height_pt > 0 &&
            op.height_pt <= 540
          )
        )
          fail("Replacement dimensions exceed the school text area.");
        const start = caption.start,
          imageIndex = element.startIndex,
          captionStyle = Object.assign({}, op.caption_style, {
            keepWithNext: true,
            keepLinesTogether: true,
          }),
          imageStyle = Object.assign({}, op.image_style, {
            keepWithNext: false,
            keepLinesTogether: true,
          });
        const requests = [
          {
            deleteContentRange: {
              range: {
                startIndex: imageIndex,
                endIndex: imageIndex + 1,
                tabId: tab.tabId,
              },
            },
          },
          {
            insertInlineImage: {
              location: { index: imageIndex, tabId: tab.tabId },
              uri: op.uri,
              objectSize: {
                width: { magnitude: op.width_pt, unit: "PT" },
                height: { magnitude: op.height_pt, unit: "PT" },
              },
            },
          },
          {
            updateParagraphStyle: {
              range: { startIndex: p.start, endIndex: p.end, tabId: tab.tabId },
              paragraphStyle: imageStyle,
              fields: Object.keys(imageStyle).join(","),
            },
          },
          {
            createNamedRange: {
              name: "SOLAIR_ASSET_" + op.asset_id,
              range: {
                startIndex: imageIndex,
                endIndex: imageIndex + 1,
                tabId: tab.tabId,
              },
            },
          },
        ];
        if (op.caption !== op.expected_caption) {
          requests.push(
            {
              deleteContentRange: {
                range: {
                  startIndex: start,
                  endIndex: caption.end - 1,
                  tabId: tab.tabId,
                },
              },
            },
            {
              insertText: {
                location: { index: start, tabId: tab.tabId },
                text: op.caption,
              },
            },
          );
        }
        requests.push(
          {
            updateParagraphStyle: {
              range: {
                startIndex: start,
                endIndex: start + op.caption.length + 1,
                tabId: tab.tabId,
              },
              paragraphStyle: captionStyle,
              fields: Object.keys(captionStyle).join(","),
            },
          },
          {
            updateTextStyle: {
              range: {
                startIndex: start,
                endIndex: start + op.caption.length,
                tabId: tab.tabId,
              },
              textStyle: Object.assign({}, op.caption_text_style, {
                bold: false,
                italic: false,
              }),
              fields: Object.keys(op.caption_text_style)
                .concat(["bold", "italic"])
                .join(","),
            },
          },
        );
        edits.push({
          start,
          end: p.end,
          delta: op.caption.length - op.expected_caption.length,
          requests,
          summary: {
            type: op.type,
            paragraph_start: caption.start,
            image_start: p.start,
            old_image_id: op.old_image_id,
            before_caption: op.expected_caption,
            asset_id: op.asset_id,
            caption: op.caption,
            width_pt: op.width_pt,
            height_pt: op.height_pt,
            caption_style: captionStyle,
            image_style: imageStyle,
            caption_text_style: op.caption_text_style,
            evidence: op.evidence,
          },
        });
      } else if (op.type === "insert_figure") {
        const matches = ps.filter(
          (p) =>
            !p.location &&
            p.text.trim() === op.after_paragraph &&
            (op.expected_start === undefined || p.start === op.expected_start),
        );
        if (matches.length !== 1)
          fail("Figure anchor is missing or ambiguous.");
        const p = matches[0];
        checkedParagraph(p, sop);
        if (
          !op.caption ||
          /[\r\n]/.test(op.caption) ||
          !op.uri ||
          !/^[A-Za-z0-9_-]+$/.test(op.asset_id || "")
        )
          fail("A figure needs a mapped asset, URI and single-line caption.");
        if (ps.some((q) => q.text.trim() === op.caption))
          fail("The figure caption already exists.");
        if (
          Object.values(tab.namedRanges || {}).some(
            (n) => n.name === "SOLAIR_ASSET_" + op.asset_id,
          )
        )
          fail(
            "This figure asset was already inserted; review it instead of duplicating it.",
          );
        if (
          !(
            op.width_pt > 0 &&
            op.width_pt <= 432 &&
            op.height_pt > 0 &&
            op.height_pt <= 540
          )
        )
          fail("Figure dimensions exceed the school text area.");
        const start = p.end;
        if (start >= ((tab.body.content.slice(-1)[0] || {}).endIndex || 0))
          fail("Choose an anchor before the final document newline.");
        if (!op.caption_style || !op.image_style || !op.caption_text_style)
          fail("A figure needs sampled school caption and image styles.");
        const caption = op.caption + "\n",
          imageIndex = start + caption.length,
          captionStyle = Object.assign({}, op.caption_style, {
            keepWithNext: true,
            keepLinesTogether: true,
          }),
          imageStyle = Object.assign({}, op.image_style, {
            keepWithNext: false,
            keepLinesTogether: true,
          });
        edits.push({
          start,
          end: start,
          delta: caption.length + 2,
          requests: [
            {
              insertText: {
                location: { index: start, tabId: tab.tabId },
                text: caption + "\n",
              },
            },
            {
              insertInlineImage: {
                location: { index: imageIndex, tabId: tab.tabId },
                uri: op.uri,
                objectSize: {
                  width: { magnitude: op.width_pt, unit: "PT" },
                  height: { magnitude: op.height_pt, unit: "PT" },
                },
              },
            },
            {
              updateParagraphStyle: {
                range: {
                  startIndex: start,
                  endIndex: imageIndex,
                  tabId: tab.tabId,
                },
                paragraphStyle: captionStyle,
                fields: Object.keys(captionStyle).join(","),
              },
            },
            {
              updateTextStyle: {
                range: {
                  startIndex: start,
                  endIndex: imageIndex - 1,
                  tabId: tab.tabId,
                },
                textStyle: Object.assign({}, op.caption_text_style, {
                  bold: false,
                  italic: false,
                }),
                fields: Object.keys(op.caption_text_style)
                  .concat(["bold", "italic"])
                  .join(","),
              },
            },
            {
              updateParagraphStyle: {
                range: {
                  startIndex: imageIndex,
                  endIndex: imageIndex + 2,
                  tabId: tab.tabId,
                },
                paragraphStyle: imageStyle,
                fields: Object.keys(imageStyle).join(","),
              },
            },
            {
              createNamedRange: {
                name: "SOLAIR_ASSET_" + op.asset_id,
                range: {
                  startIndex: imageIndex,
                  endIndex: imageIndex + 1,
                  tabId: tab.tabId,
                },
              },
            },
          ],
          summary: {
            type: op.type,
            paragraph_start: p.start,
            anchor: op.after_paragraph,
            asset_id: op.asset_id,
            caption: op.caption,
            width_pt: op.width_pt,
            height_pt: op.height_pt,
            caption_style: captionStyle,
            image_style: imageStyle,
            caption_text_style: op.caption_text_style,
            evidence: op.evidence,
          },
        });
      } else fail("Unsupported operation type: " + op.type);
    });
    edits.sort((a, b) => b.start - a.start);
    for (let i = 1; i < edits.length; i++)
      if (
        edits[i].end > edits[i - 1].start ||
        edits[i].start === edits[i - 1].start
      )
        fail("Overlapping operations; use separate jobs.");
    const requests = edits.flatMap((e) => e.requests);
    edits.forEach((e) => {
      if (e.summary.paragraph_start !== undefined)
        e.summary.final_start =
          e.summary.paragraph_start +
          edits
            .filter((other) => other.start < e.summary.paragraph_start)
            .reduce((sum, other) => sum + (other.delta || 0), 0);
    });
    // Marker is committed atomically with the updates: retry after a lost response cannot apply twice.
    requests.push({
      createNamedRange: {
        name: markerName(job),
        range: {
          startIndex: ps[0].start,
          endIndex: ps[0].start + 1,
          tabId: tab.tabId,
        },
      },
    });
    return {
      status: "ready",
      document_id: d.documentId,
      write_control: { requiredRevisionId: d.revisionId },
      requests,
      changes: edits.map((e) => e.summary),
    };
  }
  function verify(raw, planned, config) {
    const doc = normalize(raw),
      tab = doc.tabs.find((t) => t.tabId === config.tab_id),
      ps = paragraphs(tab);
    return planned.changes.every((change) => {
      if (change.type === "replace_text") {
        const matches = ps.filter(p => p.text === change.expected_paragraph_after && (change.final_start === undefined || p.start === change.final_start));
        if (matches.length !== 1) return false;
        const p = matches[0];
        return !change.expected_text_styles || change.expected_text_styles.every(region => {
          const begin = p.start + region.offset, end = begin + region.length;
          return p.paragraph.elements.filter(e => e.textRun && e.endIndex > begin && e.startIndex < end).every(e => {
            const actual = styleAt(tab,p,Math.max(begin,e.startIndex));
            return sameStyle(Object.assign({},actual,{bold:actual.bold === true}),region.style);
          });
        });
      }
      if (change.type === "format_paragraph") {
        const p = ps.find(
          (p) =>
            !p.location &&
            p.text.trim() === change.text &&
            (change.final_start === undefined ||
              p.start === change.final_start),
        );
        const normal =
          p &&
          ((tab.namedStyles || {}).styles || []).find(
            (s) =>
              s.namedStyleType === p.paragraph.paragraphStyle?.namedStyleType,
          );
        return (
          p &&
          sameStyle(
            Object.assign(
              {},
              normal?.paragraphStyle || {},
              p.paragraph.paragraphStyle,
            ),
            change.paragraph_style,
          ) &&
          (!change.text_style ||
            p.paragraph.elements
              .filter((e) => e.textRun?.content.trim())
              .every((e) =>
                sameStyle(styleAt(tab, p, e.startIndex), change.text_style),
              ))
        );
      }
      if (change.type === "insert_figure" || change.type === "replace_figure") {
        const captions = ps.filter(
          (p) => !p.location && p.text.trim() === change.caption,
        );
        if (captions.length !== 1) return false;
        const p = captions[0],
          image = ps.find((q) => q.start === p.end),
          elements =
            image?.paragraph.elements.filter((e) => e.inlineObjectElement) ||
            [];
        if (
          elements.length !== 1 ||
          image.text !== "\uFFFC\n" ||
          !sameStyle(p.paragraph.paragraphStyle, change.caption_style) ||
          !sameStyle(image.paragraph.paragraphStyle, change.image_style)
        )
          return false;
        const element = elements[0],
          object =
            tab.inlineObjects?.[element.inlineObjectElement.inlineObjectId]
              ?.inlineObjectProperties?.embeddedObject;
        return (
          object &&
          (!change.old_image_id || !tab.inlineObjects?.[change.old_image_id]) &&
          Math.abs(object.size.width.magnitude - change.width_pt) < 0.2 &&
          Math.abs(object.size.height.magnitude - change.height_pt) < 0.2 &&
          p.paragraph.elements
            .filter((e) => e.textRun?.content.trim())
            .every((e) =>
              sameStyle(
                styleAt(tab, p, e.startIndex),
                change.caption_text_style,
              ),
            ) &&
          Object.values(tab.namedRanges || {}).some(
            (n) =>
              n.name === "SOLAIR_ASSET_" + change.asset_id &&
              n.ranges?.some(
                (r) =>
                  r.startIndex === element.startIndex &&
                  r.endIndex === element.endIndex,
              ),
          )
        );
      }
      return false;
    });
  }
  return { normalize, paragraphs, protectedSection, plan, verify };
})();
if (typeof module !== "undefined") module.exports = Solair;
