/** Wire types generated from the Rust API's OpenAPI document (`cargo xtask openapi`); never edit `generated/`. */
import type { components, paths } from "./generated/schema";

export type { components, paths };

/** A request or response body of the API by its Rust DTO name. */
export type Schema<Name extends keyof components["schemas"]> = components["schemas"][Name];
