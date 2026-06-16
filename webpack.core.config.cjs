const path = require('path');
const webpack = require('webpack');
const fs = require('fs');
const TerserPlugin = require('terser-webpack-plugin');
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
`;

const METADATA_NEW_CORE = `// ==UserScript==
// @name         tokiDownloader
// @namespace    https://github.com/crossSiteKikyo/tokiDownloader
// @version      0.0.3
// @description  북토끼, 뉴토끼, 마나토끼 다운로더
// @author       hehaho
// @match        *://*/*webtoon/*
// @match        *://*/*novel/*
// @match        *://*/*manhwa/*
// @match        *://*/*manga/*
// @match        *://*/*comic/*
// @match        *://*/*toon/*
// @include      *://*toki*/*
// @include      *://*toon*/*
// @match        https://pray4skylark.github.io/tokiSync/*
// @include      http://localhost:*/*
// @include      http://127.0.0.1:*/*
// @icon         https://github.com/user-attachments/assets/99f5bb36-4ef8-40cc-8ae5-e3bf1c7952ad
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @connect      pray4skylark.github.io
// @connect      localhost
// @connect      127.0.0.1
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.7.1/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip-utils/0.1.0/jszip-utils.js
// @run-at       document-start
// @noframes
// @license      MIT
// ==/UserScript==
`;

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
    minimizer: [
      new TerserPlugin({
        extractComments: false, // 주석을 외부 라이선스 파일로 쪼개서 추출 분리하는 현상 차단
        terserOptions: {
          format: {
            comments: /==UserScript==|@name|@namespace|@version|@description|@author|@updateURL|@downloadURL|@match|@include|@icon|@grant|@connect|@require|@run-at|@license/i, // 유저스크립트 필수 헤더 규격 주석의 안전 보존
          },
        },
      }),
    ],
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
