const path = require('path');
const webpack = require('webpack');
const fs = require('fs');
const pkg = require('./package.json');

// Metadata Block
const METADATA_MAIN = `// ==UserScript==
// @name         TokiSync (Link to Drive)
// @namespace    http://tampermonkey.net/
// @version      ${pkg.components.script}
// @description  Toki series sites -> Google Drive syncing tool (Bundled)
// @author       pray4skylark
// @updateURL    https://pray4skylark.github.io/tokiSync/tokiSync.user.js
// @downloadURL  https://pray4skylark.github.io/tokiSync/tokiSync.user.js
// @match        *://*/*webtoon/*
// @match        *://*/*novel/*
// @match        *://*/*manhwa/*
// @match        *://*/*manga/*
// @match        *://*/*comic/*
// @match        *://*/*toon/*
// @include      *://*toki*/*
// @include      *://*toon*/*
// @match        https://script.google.com/*
// @match        https://*.github.io/tokiSync/*
// @match        https://pray4skylark.github.io/tokiSync/*
// @include      http://localhost:*/*
// @include      http://127.0.0.1:*/*
// @icon         https://github.com/user-attachments/assets/99f5bb36-4ef8-40cc-8ae5-e3bf1c7952ad
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
// @grant        GM_download
// @connect      api.github.com
// @connect      raw.githubusercontent.com
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @connect      pray4skylark.github.io
// @connect      127.0.0.1
// @connect      localhost
// @connect      *
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip-utils/0.1.0/jszip-utils.js
// @run-at       document-start
// @noframes
// @license      MIT
// ==/UserScript==
`
// Copy rules.sample.json to dist/rules.json for remote distribution
try {
  const destDir = path.resolve(__dirname, 'dist');
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  
  fs.copyFileSync(
    path.resolve(__dirname, 'src/core/parsers/rules.sample.json'),
    path.resolve(__dirname, 'dist/rules.json')
  );
  console.log("✅ Copied rules.sample.json to dist/rules.json");
} catch (e) {
  console.error("❌ Failed to copy rules.json:", e.message);
}

module.exports = {
  mode: 'production',
  entry: './src/core/index.js',
  externals: {
    jszip: 'JSZip' // @require CDN 전역 → 번들 제외
  },
  output: {
    filename: 'tokiSync.user.js',
    path: path.resolve(__dirname, 'dist'),
    clean: false,
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        type: 'asset/source',
      },
    ],
  },
  optimization: {
    minimize: false,
  },
  plugins: [
    new webpack.DefinePlugin({
      __SCRIPT_VERSION__: JSON.stringify(pkg.components.script),
      __VIEWER_VERSION__: JSON.stringify(pkg.components.viewer),
      __GAS_VERSION__: JSON.stringify(pkg.components.gas)
    }),
    new webpack.BannerPlugin({
      banner: METADATA_MAIN,
      raw: true,
      entryOnly: true
    })
  ]
};
