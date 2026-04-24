/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `extract-inspiration` command */
  export type ExtractInspiration = ExtensionPreferences & {}
  /** Preferences accessible in the `batch-review` command */
  export type BatchReview = ExtensionPreferences & {}
  /** Preferences accessible in the `extract-benchmark` command */
  export type ExtractBenchmark = ExtensionPreferences & {}
  /** Preferences accessible in the `scrape-account` command */
  export type ScrapeAccount = ExtensionPreferences & {}
  /** Preferences accessible in the `view-tasks` command */
  export type ViewTasks = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `extract-inspiration` command */
  export type ExtractInspiration = {}
  /** Arguments passed to the `batch-review` command */
  export type BatchReview = {}
  /** Arguments passed to the `extract-benchmark` command */
  export type ExtractBenchmark = {}
  /** Arguments passed to the `scrape-account` command */
  export type ScrapeAccount = {}
  /** Arguments passed to the `view-tasks` command */
  export type ViewTasks = {}
}

