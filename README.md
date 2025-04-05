# 1. 뉴토끼 마나토끼 북토끼 다운로드 스크립트
- 프로그램 설치 불필요
- 정보수집 없음
## 사용법
1. Tempermonkey 확장 프로그램 설치
2. [tokiDownloader](https://greasyfork.org/ko/scripts/531932-tokidownloader) 접속해 스크립트 설치
3. 뉴토끼, 마나토끼, 북토끼 회차 목록 페이지 접속
4. 원하는 기능을 클릭해 다운로드

https://github.com/user-attachments/assets/fe974989-5ffb-4831-b2dc-7ea576712f62
## 폴더(디렉토리) 구조
뉴토끼, 마나토끼
```
뉴토끼 시작연재이름 ~ 마지막연재이름/
|
├─ 0001 어떤만화-1화/
|   ├─ 어떤만화-1화 image0000.jpg
|  ...
|   └─ 어떤만화-1화 image0015.jpg
├─ 0002 어떤만화-2화/
|   ├─ 어떤만화-2화 image0000.jpg
|  ...
|   └─ 어떤만화-2화 image0030.jpg
...
└─ 0123 어떤만화-123화/
    ├─ 어떤만화-123화 image0000.jpg
   ...
    └─ 어떤만화-123화 image0030.jpg
```
북토끼
```
북토끼 시작연재이름 ~ 마지막연재이름/
|
├─ 0001 어떤소설-1화.txt
├─ 0002 어떤소설-2화.txt
├─ 0003 어떤소설-3화.txt
...
└─ 1234 어떤소설-1234화.txt
```

# 2. 뉴토끼 마나토끼 북토끼 다운로더
## 준비물 
Nodejs
## 설치 방법
```bash
git clone https://github.com/crossSiteKikyo/tokiDownloader.git
cd tokiDownloader
npm install
```
https://github.com/user-attachments/assets/b3879c59-3381-407b-a3a8-ad8bf8d84cbb
## 명령어
```bash
node down -url "URL" [-start STARTINDEX] [-last LASTINDEX]
```
- -url은 필수 입력입니다. 반드시 큰따옴표 안에 넣어주세요.
- -start는 옵션입니다. 받고싶은 회차 시작 번호를 입력하세요. 생략하면 처음부터 받습니다.
- -last는 옵션입니다. 받고싶은 마지막 회차 번호를 입력하세요. 생략하면 마지막까지 받습니다.

https://github.com/user-attachments/assets/86c17334-c96c-48d2-bfdb-31072766030c

## 폴더(디렉토리) 구조
```
뉴토끼/
├─ 웹툰이름1/
│   ├─ 0001 어떤웹툰-1화/
│   │   ├─ 0001 어떤웹툰-1화 image0000.jpg
│   │   ├─ 0001 어떤웹툰-1화 image0001.jpg
│   │   ...
│   │   └─ 0001 어떤웹툰-1화 image0024.jpg
│   └─ 0002 어떤웹툰-2화/
│       ├─ 0002 어떤웹툰-2화 image0000.jpg
│       ├─ 0002 어떤웹툰-2화 image0001.jpg
│       ...
│       └─ 0002 어떤웹툰-2화 image0020.jpg
└─ 웹툰이름2/

마나토끼/
├─ 만화이름1/
│   ├─ 0001 어떤만화-1화/
│   │   ├─ 0001 어떤만화-1화 image0000.jpg
│   │   ├─ 0001 어떤만화-1화 image0001.jpg
│   │   ...
│   │   └─ 0001 어떤만화-1화 image0015.jpg
│   └─ 0002 어떤만화-2화/
│       ├─ 0002 어떤만화-2화 image0000.jpg
│       ├─ 0002 어떤만화-2화 image0001.jpg
│       ...
│       └─ 0002 어떤만화-2화 image0032.jpg
└─ 만화이름2/

북토끼/
├─ 소설이름1/
│   ├─ 0001 어떤소설-1화.txt
│   ├─ 0001 어떤소설-2화.txt
│   ...
│   └─ 0002 어떤소설-20화.txt
└─ 소설이름2/
```
## 질문
### 오류 또는 개선사항 문의 
[issue](https://github.com/crossSiteKikyo/tokiDownloader/issues) 에 제보해주세요. 스크립트방식인지 다운로더인지, 어떤 링크를 시도한건지 어떤 오류가 난건지 상세히 적어주셔야 해결 가능합니다.
### cloudflare captcha 자동으로 체크해주실 수 없나요?
전에는 라이브러리에 오류가 있었는데 지금은 자동 체크 합니다.