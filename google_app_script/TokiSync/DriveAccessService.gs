/**
 * @file DriveAccessService.gs
 * @description Google Drive API v3 (Advanced Service) 기반의 고성능 드라이브 접근 레이어
 * @version 1.0.0 (TokiSync v1.7.6+)
 */

const DriveAccessService = {
  /**
   * 내 드라이브(Root)의 ID를 가져옵니다.
   * @returns {string} Root ID
   */
  getRootId: function() {
    try {
      return Drive.Files.get("root", { fields: "id", supportsAllDrives: true }).id;
    } catch (e) {
      this._handleError("getRootId()", e);
    }
  },

  /**
   * 폴더 또는 파일의 메타데이터를 가져옵니다.
   * @param {string} id - Google Drive ID
   * @returns {Object} { id, name, mimeType, parents, size, modifiedTime }
   */
  getMetadata: function(id) {
    try {
      const file = Drive.Files.get(id, {
        fields: "id, name, mimeType, parents, size, modifiedTime",
        supportsAllDrives: true
      });
      return file;
    } catch (e) {
      this._handleError(`getMetadata(${id})`, e);
    }
  },

  /**
   * 폴더 내의 파일/폴더 목록을 조회합니다. (페이지네이션 지원)
   * @param {string} parentId - 부모 폴더 ID
   * @param {Object} options - { query, fields, pageSize, pageToken }
   * @returns {Object} { files: Array, nextPageToken: string }
   */
  listPaged: function(parentId, options = {}) {
    const query = [`'${parentId}' in parents`, "trashed = false"];
    if (options.query) query.push(options.query);

    try {
      const response = Drive.Files.list({
        q: query.join(" and "),
        fields: options.fields || "nextPageToken, files(id, name, mimeType, modifiedTime, size)",
        pageSize: options.pageSize || 1000,
        pageToken: options.pageToken || null,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true
      });

      return {
        files: response.files || [],
        nextPageToken: response.nextPageToken || null
      };
    } catch (e) {
      this._handleError(`listPaged(${parentId})`, e);
    }
  },

  /**
   * 폴더 내의 모든 파일/폴더 목록을 조회합니다. (자동 페이지네이션)
   * @param {string} parentId - 부모 폴더 ID
   * @param {Object} options - { query, fields, pageSize }
   * @returns {Array} 파일 메타데이터 배열
   */
  list: function(parentId, options = {}) {
    const results = [];
    let pageToken = null;

    do {
      const response = this.listPaged(parentId, { ...options, pageToken: pageToken });
      results.push(...response.files);
      pageToken = response.nextPageToken;
    } while (pageToken);

    return results;
  },

  /**
   * 특정 이름의 하위 폴더를 찾거나 생성합니다.
   * @param {string} parentId - 부모 폴더 ID
   * @param {string} name - 폴더 이름
   * @returns {string} 생성 또는 발견된 폴더 ID
   */
  ensureFolder: function(parentId, name) {
    const safeName = name.replace(/'/g, "\\'");
    const folders = this.list(parentId, {
      query: `name = '${safeName}' and mimeType = 'application/vnd.google-apps.folder'`,
      pageSize: 1
    });

    if (folders.length > 0) return folders[0].id;

    try {
      const newFolder = Drive.Files.create({
        name: name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId]
      }, null, { supportsAllDrives: true });
      return newFolder.id;
    } catch (e) {
      this._handleError(`ensureFolder(${name})`, e);
    }
  },

  /**
   * 파일 내용을 텍스트로 가져옵니다.
   * @param {string} fileId - 파일 ID
   * @returns {string} 파일 내용
   */
  getFileContent: function(fileId) {
    try {
      const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
      const res = UrlFetchApp.fetch(url, {
        headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });
      if (res.getResponseCode() !== 200 && res.getResponseCode() !== 206) {
         throw new Error(`HTTP ${res.getResponseCode()}: ${res.getContentText()}`);
      }
      return res.getContentText();
    } catch (e) {
      this._handleError(`getFileContent(${fileId})`, e);
    }
  },

  /**
   * 파일 내용을 업데이트합니다.
   * @param {string} fileId - 파일 ID
   * @param {string} content - 저장할 텍스트 내용
   * @param {string} mimeType - MIME 타입
   */
  updateFileContent: function(fileId, content, mimeType = "application/json") {
    try {
      const blob = Utilities.newBlob(content, mimeType);
      return Drive.Files.update({}, fileId, blob, { supportsAllDrives: true });
    } catch (e) {
      this._handleError(`updateFileContent(${fileId})`, e);
    }
  },

  /**
   * 신규 파일을 생성합니다.
   * @param {string} parentId - 부모 폴더 ID
   * @param {string} name - 파일 이름
   * @param {string} content - 파일 내용
   * @param {string} mimeType - MIME 타입
   */
  createFile: function(parentId, name, content, mimeType = "text/plain") {
    try {
      const blob = Utilities.newBlob(content, mimeType);
      const metadata = {
        name: name,
        parents: [parentId]
      };
      return Drive.Files.create(metadata, blob, { supportsAllDrives: true }).id;
    } catch (e) {
      this._handleError(`createFile(${name})`, e);
    }
  },

  /**
   * 파일 또는 폴더를 이동합니다.
   * @param {string} fileId - 파일 ID
   * @param {string} oldParentId - 기존 부모 ID
   * @param {string} newParentId - 신규 부모 ID
   */
  move: function(fileId, oldParentId, newParentId) {
    try {
      return Drive.Files.update({}, fileId, null, {
        addParents: newParentId,
        removeParents: oldParentId,
        supportsAllDrives: true
      });
    } catch (e) {
      this._handleError(`move(${fileId})`, e);
    }
  },

  /**
   * 파일의 메타데이터(이름 등)를 패치합니다.
   * @param {string} fileId - 파일 ID
   * @param {Object} metadata - 업데이트할 메타데이터 (e.g. { name: "new_name" })
   */
  patch: function(fileId, metadata) {
    try {
      return Drive.Files.update(metadata, fileId, null, { supportsAllDrives: true });
    } catch (e) {
      this._handleError(`patch(${fileId})`, e);
    }
  },

  /**
   * 파일의 모든 바이트를 가져옵니다.
   * @param {string} fileId - 파일 ID
   * @returns {Byte[]} 바이트 배열
   */
  getFileBytes: function(fileId) {
    try {
      const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`;
      const res = UrlFetchApp.fetch(url, {
        headers: { Authorization: "Bearer " + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true
      });
      if (res.getResponseCode() !== 200 && res.getResponseCode() !== 206) {
         throw new Error(`HTTP ${res.getResponseCode()}: ${res.getContentText()}`);
      }
      return res.getBlob().getBytes();
    } catch (e) {
      this._handleError(`getFileBytes(${fileId})`, e);
    }
  },

  /**
   * 파일을 휴지통으로 보냅니다.
   * @param {string} fileId - 파일 ID
   */
  trash: function(fileId) {
    try {
      return Drive.Files.update({ trashed: true }, fileId, null, { supportsAllDrives: true });
    } catch (e) {
      this._handleError(`trash(${fileId})`, e);
    }
  },

  /**
   * 내부 에러 핸들러
   * @private
   */
  _handleError: function(context, e) {
    const errorMsg = `[DriveAccessService] ${context} 실패: ${e.message}`;
    console.error(errorMsg);
    // Option 2-B: Exception 발생
    throw new Error(errorMsg);
  }
};
