declare module "saxen" {
  export class Parser {
    on(
      event: "openTag",
      handler: (
        name: string,
        attributes: () => Record<string, string>,
        decodeEntities: (value: string) => string,
      ) => void,
    ): this;
    on(event: "error" | "warn", handler: (error: Error) => void): this;
    on(event: "attention" | "question", handler: (value: string) => void): this;
    parse(xml: string): void;
  }
}
