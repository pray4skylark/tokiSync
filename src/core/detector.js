export function detectSite() {
    const currentURL = document.URL;
    let site = '뉴토끼'; // Default
    let protocolDomain = 'https://newtoki350.com'; // Default fallback
    let category = 'Webtoon'; // Default
    let parsedUrl = null;

    try {
        parsedUrl = new URL(currentURL);
    } catch (e) {
        return null;
    }

    const hostname = parsedUrl.hostname;
    const pathname = parsedUrl.pathname;

    // NewToki novel pages moved from the old BookToki-only host pattern to ntkXX.com/novel/{seriesId}.
    // Keep this scoped to series/episode pages so the top-level /novel catalogue is not treated as a download page.
    if (
        (/^(booktoki|newtoki)\d+\.com$/.test(hostname) || /^ntk\d+\.com$/.test(hostname)) &&
        /^\/novel\/[0-9]+(?:\/[0-9]+)?\/?$/.test(pathname)
    ) {
        site = hostname.startsWith('booktoki') ? '북토끼' : '뉴토끼';
        protocolDomain = parsedUrl.origin;
        category = 'Novel';
    }

    else if (currentURL.match(/^https:\/\/booktoki[0-9]+.com\/novel\/[0-9]+/)) {
        site = "북토끼"; 
        protocolDomain = currentURL.match(/^https:\/\/booktoki[0-9]+.com/)[0];
        category = 'Novel';
    }
    else if (currentURL.match(/^https:\/\/newtoki[0-9]+.com\/webtoon\/[0-9]+/)) {
        site = "뉴토끼"; 
        protocolDomain = currentURL.match(/^https:\/\/newtoki[0-9]+.com/)[0];
        category = 'Webtoon';
    }
    else if (currentURL.match(/^https:\/\/manatoki[0-9]+.net\/comic\/[0-9]+/)) {
        site = "마나토끼"; 
        protocolDomain = currentURL.match(/^https:\/\/manatoki[0-9]+.net/)[0];
        category = 'Manga';
    }
    else {
        return null; // Not a valid target page
    }

    return { site, protocolDomain, category };
}
