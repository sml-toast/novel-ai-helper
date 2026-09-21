// @ts-check
// 写作页分区导航 + 整理视图 + 录入表单折叠（零依赖，事件委托）
// 仅做平滑滚动、滚动高亮、辅助模块折叠、录入表单渐进式披露；不改动既有 DOM 结构与交互。
(function () {
  'use strict';
  var nav = document.querySelector('.workspace-nav');
  if (!nav) return;

  var links = Array.prototype.slice.call(nav.querySelectorAll('.nav-link'));
  var targets = links
    .map(function (a) {
      return document.querySelector(a.getAttribute('href'));
    })
    .filter(Boolean);

  function setActive(link) {
    links.forEach(function (l) {
      l.classList.toggle('active', l === link);
    });
  }

  // 录入表单开关按钮（默认收起：body.forms-collapsed）
  var formsBtn = nav.querySelector('[data-action="toggle-forms"]');
  function syncFormsLabel() {
    if (!formsBtn) return;
    var on = document.body.classList.contains('forms-collapsed');
    formsBtn.textContent = on ? '展开录入' : '收起录入';
    formsBtn.setAttribute('aria-pressed', String(on));
  }
  syncFormsLabel();
  if (formsBtn) {
    formsBtn.addEventListener('click', function () {
      document.body.classList.toggle('forms-collapsed');
      syncFormsLabel();
    });
  }

  nav.addEventListener('click', function (e) {
    var link = /** @type {Element} */ (e.target).closest('.nav-link');
    if (!link) return;
    var el = document.querySelector(link.getAttribute('href'));
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActive(link);
    // 跳转至管理区时自动展开录入表单，避免只看到标题与按钮
    if (
      el.classList.contains('ops-layout') &&
      document.body.classList.contains('forms-collapsed')
    ) {
      document.body.classList.remove('forms-collapsed');
      syncFormsLabel();
    }
  });

  // 滚动联动高亮（scrollspy）：当前可视分区对应的导航项高亮
  if ('IntersectionObserver' in window && targets.length) {
    var obs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var id = '#' + entry.target.id;
          var link = links.filter(function (l) {
            return l.getAttribute('href') === id;
          })[0];
          if (link) setActive(link);
        });
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 },
    );
    targets.forEach(function (t) {
      obs.observe(t);
    });
  }

  // 整理视图：折叠 / 展开辅助模块，专注写作（默认展开，测试不受影响）
  var compactBtn = nav.querySelector('[data-action="toggle-compact"]');
  if (compactBtn) {
    compactBtn.addEventListener('click', function () {
      var on = document.body.classList.toggle('compact-mode');
      compactBtn.classList.toggle('active', on);
      compactBtn.setAttribute('aria-pressed', String(on));
      compactBtn.textContent = on ? '展开全部' : '整理视图';
    });
  }
})();
