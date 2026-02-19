const path = require('path');
const webpack = require('webpack');
const fs = require('fs');

// Metadata Block
const METADATA_MAIN = `// ==UserScript==
// @name         TokiSync (Link to Drive)
// @namespace    http://tampermonkey.net/
// @version      1.4.1
// @description  Toki series sites -> Google Drive syncing tool (Bundled)
// @author       pray4skylark
// @updateURL    https://raw.githubusercontent.com/pray4skylark/tokiSync/main/docs/tokiSync.user.js
// @downloadURL  https://raw.githubusercontent.com/pray4skylark/tokiSync/main/docs/tokiSync.user.js
// @match        https://*.com/webtoon/*
// @match        https://*.com/novel/*
// @match        https://*.net/comic/*
// @match        https://script.google.com/*
// @match        https://*.github.io/tokiSync/*
// @match        https://pray4skylark.github.io/tokiSync/*
// @match        http://localhost:*/*
// @match        http://127.0.0.1:*/*
// @icon         https://github.com/user-attachments/assets/99f5bb36-4ef8-40cc-8ae5-e3bf1c7952ad
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_registerMenuCommand
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
// @run-at       document-end
// @license      MIT
// ==/UserScript==
`;

const METADATA_NEW_CORE = `// ==UserScript==
// @name         tokiDownloader
// @namespace    https://github.com/crossSiteKikyo/tokiDownloader
// @version      0.0.3
// @description  북토끼, 뉴토끼, 마나토끼 다운로더
// @author       hehaho
// @match        https://*.com/webtoon/*
// @match        https://*.com/novel/*
// @match        https://*.net/comic/*
// @match        https://pray4skylark.github.io/tokiSync/*
// @match        http://localhost:*/*
// @match        http://127.0.0.1:*/*
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
// @run-at       document-end
// @license      MIT
// ==/UserScript==
`;

module.exports = {
  mode: 'production',
  entry: './src/core/index.js',
  output: {
    filename: 'tokiSync.user.js',
    path: path.resolve(__dirname, 'docs'),
    clean: false,
  },
  optimization: { minimize: false },
  plugins: [
    new webpack.BannerPlugin({
      banner: METADATA_MAIN,
      raw: true,
      entryOnly: true
    })
  ]
};
