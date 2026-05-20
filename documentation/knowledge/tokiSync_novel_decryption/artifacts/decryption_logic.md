# tokiSync Novel Decryption Core Logic

## Overview
TokiSync uses an API-based decryption pipeline to extract novel content, bypassing Shadow DOM protections. This mechanism relies on XOR decryption and HMAC-SHA256 proof generation.

## Key Components

### 1. Token Extraction
Tokens are extracted from the episode HTML using a regex pattern. These tokens are episode-specific and have a short TTL.
- **Regex**: `/\\?"token\\?":\\?"(eyJ[A-Za-z0-9_-]+[A-Za-z0-9_=.-]*)\\?"/`

### 2. Proof Generation (HMAC-SHA256)
To authenticate the API request, a `proof` is generated using the `nv` cookie as a secret.
- **Message Format**: `${token}.${nonce}.${navigator.userAgent}`
- **Algorithm**: HMAC-SHA256 via `crypto.subtle`.

### 3. XOR Decryption
The final payload received from the API is encrypted using XOR. The key is derived from the `nv` cookie.
- **Key Derivation**: `cookie.split('.')[0]` (Base64URL decoded).
- **Mechanism**: `payload[i] ^ key[i % key.length]`.

## Audit Results & Future Recommendations (Audit by gemma4-ki 25.2B)

### ⚠️ Critical Weakness: Regex-based Parsing
The current implementation uses regex to clean and extract JSON data from API responses.
- **Issue**: Brittle and prone to failure if the API structure changes even slightly (e.g., whitespace).
- **Security**: Can be bypassed or lead to XSS if not handled carefully.
- **Recommendation**: Transition to `JSON.parse()` for structured data extraction.

### Data Cleaning Logic
The current cleaning logic in `downloader.js` involves:
```javascript
cleanText = cleanText.replace(/^\{"kind"\s*:\s*"(text|html)"\s*,\s*"(text|html)"\s*:\s*"/, '');
cleanText = cleanText.replace(/"\s*(,\s*"css"\s*:\s*""\s*)?\}$/, '');
cleanText = cleanText.replace(/\\n/g, '\n');
cleanText = cleanText.replace(/\\"/g, '"');
```
**Warning**: Replacing `\"` with `"` can corrupt data if the original content contains intentional escaped quotes.

## Error Handling
- **Nv Cookie Reset**: If the API returns an error, the `nv` cookie is cleared and re-issued via `/api/nv-issue` once.
- **XHR Fallback**: If the API path fails completely, the system falls back to DOM-based parsing (if available).
