## webtoon ##
1. URL : https://ntk01.com/webtoon/11267

2. 본문 메타 데이터 Dom객체

```html
<div class="container hero-v2-inner"><div class="crumb crumb-on-dark"><a href="/">홈</a> ·<!-- --> <a href="/ing">연재중 웹툰</a></div><div class="hero-v2-grid"><div class="hero-v2-thumb"><img src="https://i.toonflix.app/blacktoon/thumbs/11267.jpg?v2" alt="만고지존"><button type="button" class="fav-heart  " aria-pressed="false" aria-label="즐겨찾기 추가" title="즐겨찾기 추가"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg></button></div><div class="hero-v2-meta"><div class="hero-v2-badges"><span class="pill pill-status ongoing">● <!-- -->연재중</span><span class="pill pill-day">월<!-- -->요일</span><span class="pill pill-plat"><img src="/platforms/kakao.png" alt="카카오"><span>카카오</span></span></div><h1 class="hero-v2-title">만고지존</h1><div class="hero-v2-author"><a style="color:inherit;text-decoration:underline;text-underline-offset:2px" title="작가 &quot;태일생수,잭 노르웨이&quot; 의 다른 작품 검색" href="/search?q=%ED%83%9C%EC%9D%BC%EC%83%9D%EC%88%98%2C%EC%9E%AD%20%EB%85%B8%EB%A5%B4%EC%9B%A8%EC%9D%B4&amp;kind=webtoon">태일생수,잭 노르웨이</a></div><div class="hero-v2-tags"><span class="hero-v2-tag">#<!-- -->액션</span><span class="hero-v2-tag">#<!-- -->무협</span></div><div class="hero-v2-stats"><div class="stat"><div class="stat-num">475</div><div class="stat-key">총 회차</div></div><div class="stat"><div class="stat-num">1.7만</div><div class="stat-key">누적 조회</div></div><div class="stat"><div class="stat-num">43.8만</div><div class="stat-key">주간</div></div></div><div class="hero-v2-actions"><a class="cta cta-primary" href="/webtoon/11267/1593996"><span class="ic">▶</span><span class="t">최신화 보기</span><span class="s">475<!-- -->화</span></a><a class="cta cta-ghost" href="/webtoon/11267/1025955"><span class="ic">📖</span><span class="t">첫화부터 정주행</span></a><button type="button" class="cta cta-fav  " aria-pressed="false" aria-label="즐겨찾기 추가" title="즐겨찾기 추가"><span class="ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg></span><span class="t">즐겨찾기</span></button></div></div></div></div>
``` 
2.1 : 각정보 셀렉터 
    - 썸네일 : div.hero-v2-thumb>img
    - 메타 정보 : div.hero-v2-meta
    -- 연재 상태 : span.pill-status
    -- 연재 요일 : span.pill-day
    -- 플랫폼 : span.pill-plat
    -- 작품 제목 : h1.hero-v2-title
    -- 작가 : div.hero-v2-author
    -- 태그 : div.hero-v2-tags
    -- 조회수 : div.hero-v2-stats

3 : 에피소드 목록 HTML 정보
```html
<main class="container">
<div class="ep-section">
<div class="ep-section-head">
<div class="ep-section-title"><h2>전체 회차</h2><span class="ep-section-count">총 475회차</span></div>
<div class="ep-sort">
<a class="active" href="/webtoon/11267">최신순</a>
<a class="" href="/webtoon/11267?sort=asc">첫화순</a>
</div>
</div>
<ul class="ep-list-v2">
<li class="ep-row-v2 ep-row-v2--ready">
<a class="ep-row-v2-link" href="/webtoon/11267/1593996"><div class="ep-row-v2-thumb"><img src="https://i.toonflix.app/blacktoon/thumbs/11267.jpg?v2" alt="" loading="lazy" decoding="async"><span class="ep-row-v2-no">477</span></div><div class="ep-row-v2-body"><div class="ep-row-v2-title"><strong>477화</strong></div><div class="ep-row-v2-meta"><span class="ep-badge-new">NEW</span><span class="ep-badge-ready" title="96장">▶ 보기</span><span class="ep-row-v2-date">26.04.26</span></div></div><div class="ep-row-v2-arrow">›</div></a></li>
......
</ul></section></div></main>
```    
3.1 : 에피소드 목록 상세 정보
   - 에피소드 목록 : ul.ep-list-v2
   -- 에피소드 each : li.ep-row-v2--ready
   --- 썸네일 : img
   --- 화번호 : span.ep-row-v2-no
   --- 상태 : span.ep-badge-ready
   --- 날짜 : span.ep-row-v2-date
   --- 링크 : a.ep-row-v2-link