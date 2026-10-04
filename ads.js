(function(){
  const SMARTLINK = 'https://www.profitableratecpmnetwork.com/ui0j3pra?key=d399235ded04378cd859207920326c81';

  // علامة حمرا نتأكد بيها إن الملف شغال
  function makeBadge(t){
    const b = document.createElement('div');
    b.style.cssText = 'position:fixed;bottom:6px;right:6px;background:red;color:#fff;padding:3px 7px;border-radius:8px;font:10px Cairo,sans-serif;z-index:9999999;';
    b.textContent = t;
    document.body.appendChild(b);
    return b;
  }

  // نشيل الخانة القديمة فوراً وكل شوية
  function removePanel(){
    const p = document.getElementById('dailyAdsPanel');
    if (p) p.remove();
  }

  // إعلان بيني كل 30 ثانية
  let last = 0;
  function fireAd(){
    if (Date.now() - last < 30000) return;
    last = Date.now();
    const w = window.open(SMARTLINK, '_blank');
    if (!w) window.location.href = SMARTLINK;
  }

  // نشغّل لما الصفحة تخلص
  function start(){
    makeBadge('✅');
    removePanel();
    setInterval(removePanel, 500);

    const msg = document.getElementById('message');
    if (msg) {
      let lastText = '';
      setInterval(function(){
        const t = (msg.textContent || '').trim();
        if (t === lastText) return;
        lastText = t;
        if (t.indexOf('قنبلة') !== -1 || t.indexOf('خسرت') !== -1) {
          setTimeout(fireAd, 1500);
        }
      }, 500);
    }

    // نظهر زرار الإعلان بعد الخسارة
    const rec = document.getElementById('adRecover');
    if (rec) rec.classList.add('show');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
