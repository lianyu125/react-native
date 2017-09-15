/**
 * Copyright (c) 2015-present, Facebook, Inc.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree. An additional grant
 * of patent rights can be found in the PATENTS file in the same directory.
 *
 * @flow
 */
'use strict';

/* $FlowFixMe(>=0.54.0 site=react_native_oss) This comment suppresses an error
 * found when Flow v0.54 was deployed. To see the error delete this comment and
 * run Flow. */
const blacklist = require('metro-bundler/src/blacklist');
const findSymlinkedModules = require('./findSymlinkedModules');
const fs = require('fs');
const getPolyfills = require('../../rn-get-polyfills');
const invariant = require('fbjs/lib/invariant');
const path = require('path');

/* $FlowFixMe(>=0.54.0 site=react_native_oss) This comment suppresses an error
 * found when Flow v0.54 was deployed. To see the error delete this comment and
 * run Flow. */
const {providesModuleNodeModules} = require('metro-bundler/src/defaults');

const RN_CLI_CONFIG = 'rn-cli.config.js';

import type {
  GetTransformOptions,
  PostMinifyProcess,
  PostProcessModules,
  PostProcessBundleSourcemap
/* $FlowFixMe(>=0.54.0 site=react_native_oss) This comment suppresses an error
 * found when Flow v0.54 was deployed. To see the error delete this comment and
 * run Flow. */
} from 'metro-bundler/src/Bundler';
/* $FlowFixMe(>=0.54.0 site=react_native_oss) This comment suppresses an error
 * found when Flow v0.54 was deployed. To see the error delete this comment and
 * run Flow. */
import type {HasteImpl} from 'metro-bundler/src/node-haste/Module';
/* $FlowFixMe(>=0.54.0 site=react_native_oss) This comment suppresses an error
 * found when Flow v0.54 was deployed. To see the error delete this comment and
 * run Flow. */
import type {TransformVariants} from 'metro-bundler/src/ModuleGraph/types.flow';
/* $FlowFixMe(>=0.54.0 site=react_native_oss) This comment suppresses an error
 * found when Flow v0.54 was deployed. To see the error delete this comment and
 * run Flow. */
import type {PostProcessModules as PostProcessModulesForBuck} from 'metro-bundler/src/ModuleGraph/types.flow.js';

/**
 * Configuration file of the CLI.
 */
export type ConfigT = {
  extraNodeModules: {[id: string]: string},
  /**
   * Specify any additional asset file extensions to be used by the packager.
   * For example, if you want to include a .ttf file, you would return ['ttf']
   * from here and use `require('./fonts/example.ttf')` inside your app.
   */
  getAssetExts: () => Array<string>,

  /**
   * Returns a regular expression for modules that should be ignored by the
   * packager on a given platform.
   */
  getBlacklistRE(): RegExp,

  /**
   * Specify whether or not to enable Babel's behavior for looking up .babelrc
   * files. If false, only the .babelrc file (if one exists) in the main project
   * root is used.
   */
  getEnableBabelRCLookup(): boolean,

  /**
   * Specify any additional polyfill modules that should be processed
   * before regular module loading.
   */
  getPolyfillModuleNames: () => Array<string>,

  /**
   * Specify any additional platforms to be used by the packager.
   * For example, if you want to add a "custom" platform, and use modules
   * ending in .custom.js, you would return ['custom'] here.
   */
  getPlatforms: () => Array<string>,

  getProjectRoots(): Array<string>,

  /**
   * Specify any additional node modules that should be processed for
   * providesModule declarations.
   */
  getProvidesModuleNodeModules?: () => Array<string>,

  /**
   * Specify any additional source file extensions to be used by the packager.
   * For example, if you want to include a .ts file, you would return ['ts']
   * from here and use `require('./module/example')` to require the file with
   * path 'module/example.ts' inside your app.
   */
  getSourceExts: () => Array<string>,

  /**
   * Returns the path to a custom transformer. This can also be overridden
   * with the --transformer commandline argument.
   */
  getTransformModulePath: () => string,
  getTransformOptions: GetTransformOptions,

  /**
   * Returns the path to the worker that is used for transformation.
   */
  getWorkerPath: () => ?string,

  /**
   * An optional list of polyfills to include in the bundle. The list defaults
   * to a set of common polyfills for Number, String, Array, Object...
   */
  getPolyfills: ({platform: ?string}) => $ReadOnlyArray<string>,

  /**
   * An optional function that can modify the code and source map of bundle
   * after the minifaction took place. (Function applied per module).
   */
  postMinifyProcess: PostMinifyProcess,

  /**
   * An optional function that can modify the module array before the bundle is
   * finalized.
   */
  postProcessModules: PostProcessModules,

  /**
   * An optional function that can modify the code and source map of the bundle
   * before it is written. Applied once for the entire bundle, only works if
   * output is a plainBundle.
   */
  postProcessBundleSourcemap: PostProcessBundleSourcemap,

  /**
   * Same as `postProcessModules` but for the Buck worker. Eventually we do want
   * to unify both variants.
   */
  postProcessModulesForBuck: PostProcessModulesForBuck,

  /**
   * A module that exports:
   * - a `getHasteName(filePath)` method that returns `hasteName` for module at
   *  `filePath`, or undefined if `filePath` is not a haste module.
   */
  hasteImpl?: HasteImpl,

  transformVariants: () => TransformVariants,
};

function getProjectPath() {
  if (__dirname.match(/node_modules[\/\\]react-native[\/\\]local-cli[\/\\]util$/)) {
    // Packager is running from node_modules.
    // This is the default case for all projects created using 'react-native init'.
    return path.resolve(__dirname, '../../../..');
  } else if (__dirname.match(/Pods[\/\\]React[\/\\]packager$/)) {
    // React Native was installed using CocoaPods.
    return path.resolve(__dirname, '../../../..');
  }
  return path.resolve(__dirname, '../..');
}

const resolveSymlinksForRoots = roots =>
  roots.reduce(
    (arr, rootPath) => arr.concat(
      findSymlinkedModules(rootPath, roots)
    ),
    [...roots]
  );


/**
 * Module capable of getting the configuration out of a given file.
 *
 * The function will return all the default configuration, as specified by the
 * `DEFAULTS` param overriden by those found on `rn-cli.config.js` files, if any. If no
 * default config is provided and no configuration can be found in the directory
 * hierarchy, an error will be thrown.
 */
const Config = {
  DEFAULTS: ({
    extraNodeModules: Object.create(null),
    getAssetExts: () => [],
    getBlacklistRE: () => blacklist(),
    getEnableBabelRCLookup: () => false,
    getPlatforms: () => [],
    getPolyfillModuleNames: () => [],
    getProjectRoots: () => {
      const root = process.env.REACT_NATIVE_APP_ROOT;
      if (root) {
        return resolveSymlinksForRoots([path.resolve(root)]);
      }
      return resolveSymlinksForRoots([getProjectPath()]);
    },
    getProvidesModuleNodeModules: () => providesModuleNodeModules.slice(),
    getSourceExts: () => [],
    getTransformModulePath: () => require.resolve('metro-bundler/src/transformer.js'),
    getTransformOptions: async () => ({}),
    getPolyfills,
    postMinifyProcess: x => x,
    postProcessModules: modules => modules,
    postProcessModulesForBuck: modules => modules,
    postProcessBundleSourcemap: ({code, map, outFileName}) => ({code, map}),
    transformVariants: () => ({default: {}}),
    getWorkerPath: () => null,
  }: ConfigT),

  find(startDir: string): ConfigT {
    return this.findWithPath(startDir).config;
  },

  findWithPath(startDir: string): {config: ConfigT, projectPath: string} {
    const configPath = findConfigPath(startDir);
    invariant(
      configPath,
      `Can't find "${RN_CLI_CONFIG}" file in any parent folder of "${startDir}"`,
    );
    const projectPath = path.dirname(configPath);
    return {config: this.loadFile(configPath, startDir), projectPath};
  },

  findOptional(startDir: string): ConfigT {
    const configPath = findConfigPath(startDir);
    return configPath
      ? this.loadFile(configPath, startDir)
      : {...Config.DEFAULTS};
  },

  loadFile(pathToConfig: string): ConfigT {
    //$FlowFixMe: necessary dynamic require
    const config: {} = require(pathToConfig);
    return {...Config.DEFAULTS, ...config};
  },
};

function findConfigPath(cwd: string): ?string {
  const parentDir = findParentDirectory(cwd, RN_CLI_CONFIG);
  return parentDir ? path.join(parentDir, RN_CLI_CONFIG) : null;
}

// Finds the most near ancestor starting at `currentFullPath` that has
// a file named `filename`
function findParentDirectory(currentFullPath, filename) {
  const root = path.parse(currentFullPath).root;
  const testDir = (parts) => {
    if (parts.length === 0) {
      return null;
    }

    const fullPath = path.join(root, parts.join(path.sep));

    var exists = fs.existsSync(path.join(fullPath, filename));
    return exists ? fullPath : testDir(parts.slice(0, -1));
  };

  return testDir(currentFullPath.substring(root.length).split(path.sep));
}

module.exports = Config;