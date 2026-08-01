document.querySelectorAll('.pp-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pp-tab').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.pp-tabpanel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.panel).classList.add('active');
  });
});
