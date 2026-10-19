/** Schemas shared by the actual managed-model request and backend validation. */
const string = { type: "string" },
  number = { type: "number" },
  boolean = { type: "boolean" };
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const nullable = (schema: unknown) => ({ anyOf: [schema, { type: "null" }] });
const dimension = object({
  magnitude: number,
  unit: { type: "string", enum: ["PT"] },
});
const paragraphStyle = object({
  alignment: nullable({
    type: "string",
    enum: ["START", "CENTER", "END", "JUSTIFIED"],
  }),
  lineSpacing: nullable(number),
  spaceAbove: nullable(dimension),
  spaceBelow: nullable(dimension),
  indentFirstLine: nullable(dimension),
  indentStart: nullable(dimension),
  indentEnd: nullable(dimension),
  keepWithNext: nullable(boolean),
  keepLinesTogether: nullable(boolean),
  avoidWidowAndOrphan: nullable(boolean),
});
export const routingSchema = object({
  sectionIds: { type: "array", items: string },
  answer: string,
});
const list = (items: unknown) => ({ type: "array", items });
const workbench = object({
  findings: list(
    object({
      statement: string,
      kind: {
        type: "string",
        enum: [
          "team_report",
          "measurement_report",
          "seller_rating",
          "calculation",
          "proposal",
          "conflict",
          "unresolved",
        ],
      },
      references: list(object({ sourceId: string, quote: string })),
      sectionIds: list(string),
      disposition: {
        type: "string",
        enum: [
          "use_with_attribution",
          "hold",
          "superseded",
          "needs_confirmation",
        ],
      },
      rationale: string,
    }),
  ),
  figures: list(
    object({
      title: string,
      kind: { type: "string", enum: ["source_visual", "human_edit"] },
      sectionId: nullable(string),
      anchorId: nullable(string),
      figureId: nullable(string),
      sourceId: nullable(string),
      pageUrl: nullable(string),
      imageUrl: nullable(string),
      locator: string,
      caption: string,
      attribution: string,
      reuse: string,
      instructions: list(string),
      checks: list(string),
    }),
  ),
  nextSteps: list(string),
});
export const proposalSchema = object({
  answer: string,
  workbench: nullable(workbench),
  operations: {
    type: "array",
    items: {
      anyOf: [
        object({
          type: { type: "string", enum: ["replace_text"] },
          anchorId: string,
          before: string,
          after: string,
          evidence: string,
          cell: nullable(
            object({
              row: { type: "integer" },
              column: { type: "integer" },
              table_anchor: nullable(string),
            }),
          ),
        }),
        object({
          type: { type: "string", enum: ["format_paragraph"] },
          anchorId: string,
          expected_text: string,
          paragraph_style: paragraphStyle,
          text_style: nullable(
            object({
              weightedFontFamily: nullable(
                object({ fontFamily: { type: "string", enum: ["Arial"] } }),
              ),
              fontSize: nullable(
                object({
                  magnitude: { type: "number", enum: [11] },
                  unit: { type: "string", enum: ["PT"] },
                }),
              ),
            }),
          ),
          evidence: string,
        }),
        object({
          type: { type: "string", enum: ["insert_figure"] },
          sourceId: string,
          anchorId: string,
          after_paragraph: string,
          caption: string,
          width_pt: nullable(number),
          evidence: string,
        }),
        object({
          type: { type: "string", enum: ["replace_figure"] },
          sourceId: string,
          figureId: string,
          caption: string,
          width_pt: nullable(number),
          evidence: string,
        }),
      ],
    },
  },
});
export function compactOperation(value: any): any {
  if (Array.isArray(value)) return value.map(compactOperation);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== null && v !== undefined)
        .map(([k, v]) => [k, compactOperation(v)])
        .filter(
          ([, v]) =>
            !(
              v &&
              typeof v === "object" &&
              !Array.isArray(v) &&
              Object.keys(v).length === 0
            ),
        ),
    );
  return value;
}
