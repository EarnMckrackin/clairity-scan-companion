const origin = window.location.origin;
const scriptUrl = `${origin}/assets/floating-companion.js`;
const bookmarklet = `javascript:(()=>{if(window.__clairityFloating){window.__clairityFloating.open();return;}const s=document.createElement('script');s.src='${scriptUrl}';s.dataset.clairityOrigin='${origin}';document.documentElement.appendChild(s);})();`;

const link = document.querySelector('#bookmarkletLink');
const copy = document.querySelector('#copyBookmarklet');
const status = document.querySelector('#bookmarkletStatus');

link.href = bookmarklet;

copy.addEventListener('click', async () => {
  await navigator.clipboard?.writeText(bookmarklet);
  status.textContent = 'Bookmarklet copied. Create a new browser bookmark and paste it into the URL field.';
});

document.querySelector('#launchHere').addEventListener('click', () => {
  const script = document.createElement('script');
  script.src = scriptUrl;
  script.dataset.clairityOrigin = origin;
  document.documentElement.appendChild(script);
});
