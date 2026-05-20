# tokiSync Google Apps Script (GAS) Development Standards

## Scoping Rules
Due to the shared global context in GAS across multiple `.gs` files, specific variable scoping rules must be followed to avoid `ReferenceError`.

### 1. Global Variables (`var`)
Always use `var` instead of `const` for global configuration or state variables that need to be accessed across different files in the same project.
- **Example**: `var API_KEY = ...;` or `var SERVER_VERSION = "v1.8.0";`

### 2. Stateless Dispatcher
The GAS backend is designed to be stateless. The client must provide the `folderId` (root folder) in the payload of every `doPost` request.
- **Verification**: `if (!data.folderId) return createRes("error", "Missing folderId");`

## Drive API Integration
- **Version**: Google Drive API v3.
- **Access Pattern**: Advanced Drive Service is preferred for high-speed file listing and metadata updates.
- **Resumable Uploads**: For large files (over 5MB), use the resumable upload protocol (`init` -> `upload chunk`).

## Security
- **API Key**: All requests must include an `apiKey` matching the one stored in GAS Script Properties.
- **Folder Isolation**: The script should only interact with folders authorized by the user via the `folderId`.

## Performance Optimization
- **Fast Path (Cache)**: Use the `_toki_cache.json` and `_MergeIndex` fragments to avoid full folder scans on every check.
- **Merging**: Background triggers (Time-driven) should handle merging fragments into the master index to keep client response times low.
