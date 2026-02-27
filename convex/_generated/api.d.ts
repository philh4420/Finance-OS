/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as _shared_guardrails from "../_shared/guardrails.js";
import type * as _shared_money_fx from "../_shared/money_fx.js";
import type * as _shared_timezone from "../_shared/timezone.js";
import type * as automation from "../automation.js";
import type * as crons from "../crons.js";
import type * as dashboard from "../dashboard.js";
import type * as governance from "../governance.js";
import type * as http from "../http.js";
import type * as planning from "../planning.js";
import type * as reliability from "../reliability.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "_shared/guardrails": typeof _shared_guardrails;
  "_shared/money_fx": typeof _shared_money_fx;
  "_shared/timezone": typeof _shared_timezone;
  automation: typeof automation;
  crons: typeof crons;
  dashboard: typeof dashboard;
  governance: typeof governance;
  http: typeof http;
  planning: typeof planning;
  reliability: typeof reliability;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
