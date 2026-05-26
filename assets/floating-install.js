const origin = window.location.origin;
const scriptUrl = `${origin}/assets/floating-companion.js`;
const externalBookmarklet = `javascript:(()=>{if(window.__clairityFloating){window.__clairityFloating.open();return;}const s=document.createElement('script');s.src='${scriptUrl}';s.dataset.clairityOrigin='${origin}';document.documentElement.appendChild(s);})();`;

const link = document.querySelector('#bookmarkletLink');
const copy = document.querySelector('#copyBookmarklet');
const status = document.querySelector('#bookmarkletStatus');
let bookmarklet = externalBookmarklet;

link.href = bookmarklet;

async function buildInlineBookmarklet() {
  try {
    const response = await fetch(scriptUrl, { cache: 'no-store' });
    if (!response.ok) throw new Error('Could not load probe source');
    const source = await response.text();
    bookmarklet = `javascript:(()=>{window.__clairityOrigin=${JSON.stringify(origin)};${source}\n})();`;
    link.href = bookmarklet;
    status.textContent = 'Drag the logo button to your bookmarks bar. The inline probe is ready for sites with strict script rules, including X.';
  } catch {
    bookmarklet = externalBookmarklet;
    link.href = bookmarklet;
    status.textContent = 'Drag the logo button to your bookmarks bar. If a site blocks it, copy the bookmarklet after loading this page over HTTPS.';
  }
}

copy.addEventListener('click', async () => {
  await navigator.clipboard?.writeText(bookmarklet);
  status.textContent = 'Bookmarklet copied. Create a new browser bookmark, paste it into the URL field, and name it Verax.';
});

document.querySelector('#launchHere').addEventListener('click', () => {
  const script = document.createElement('script');
  script.src = scriptUrl;
  script.dataset.clairityOrigin = origin;
  document.documentElement.appendChild(script);
});

buildInlineBookmarklet();
