import './fnos.css';

let cloudLoading: Promise<void> | undefined;

/** Load the optional upstream SDK only after the user chooses to connect. */
export function connectPuter(): Promise<void> {
  if (window.puter) return Promise.resolve();
  if (cloudLoading) return cloudLoading;
  cloudLoading = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    const timer = window.setTimeout(() => finish(new Error('连接 Puter 超时。你可以继续本地编辑和导出。')), 20000);
    const finish = (error?: Error) => {
      clearTimeout(timer);
      script.onload = script.onerror = null;
      if (error) {
        script.remove();
        cloudLoading = undefined;
        reject(error);
      } else resolve();
    };
    script.src = 'https://js.puter.com/v2/';
    script.dataset.fnosOptional = 'puter';
    script.onload = () => finish(window.puter ? undefined : new Error('Puter 服务未就绪，请稍后再试。'));
    script.onerror = () => finish(new Error('无法连接 Puter。你可以继续本地编辑和导出。'));
    document.head.append(script);
  });
  return cloudLoading;
}

function dialog(root: HTMLElement, kind: 'support' | 'cloud') {
  const existing = root.querySelector<HTMLDialogElement>('#fnos-dialog');
  if (existing?.open) return;
  existing?.remove();
  const d = document.createElement('dialog');
  d.id = 'fnos-dialog';
  d.className = kind === 'support' ? 'fnos-dialog fnos-support-dialog' : 'fnos-dialog';
  d.setAttribute('translate', 'no');
  d.setAttribute('aria-labelledby', 'fnos-dialog-title');
  if (kind === 'support') {
    d.innerHTML = `<form method="dialog">
      <div class="fnos-dialog-heading"><h2 id="fnos-dialog-title">请作者喝杯咖啡 ☕</h2><button class="fnos-close" value="close" aria-label="关闭赞赏窗口">×</button></div>
      <p class="fnos-intro">用得顺手的话，请作者喝杯咖啡吧。谢谢你的支持！</p>
      <div class="fnos-payments">
        <figure><figcaption>微信赞赏</figcaption><div class="fnos-qr-plate"><img src="${import.meta.env.BASE_URL}donation/wechat-6uos.jpg" alt="6uos 的微信赞赏码" loading="eager" decoding="sync"></div><a href="${import.meta.env.BASE_URL}donation/wechat-6uos.jpg" download="6uos-微信赞赏码.jpg">保存微信赞赏码</a></figure>
        <figure><figcaption>支付宝赞赏</figcaption><div class="fnos-qr-plate"><img src="${import.meta.env.BASE_URL}donation/alipay-6uos.jpg" alt="6uos 的支付宝收款码" loading="eager" decoding="sync"></div><a href="${import.meta.env.BASE_URL}donation/alipay-6uos.jpg" download="6uos-支付宝赞赏码.jpg">保存支付宝赞赏码</a></figure>
      </div>
      <p class="fnos-payment-note">心意随意，开心创作。</p>
      <div class="dialog-actions"><button class="primary" value="close">继续创作</button></div>
    </form>`;
    d.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
      img.addEventListener('error', () => {
        img.hidden = true;
        const note = document.createElement('p');
        note.textContent = '图片暂时无法显示，请使用下方链接保存原图。';
        img.parentElement!.append(note);
      }, { once: true });
    });
  } else {
    d.innerHTML = `<form method="dialog"><h2 id="fnos-dialog-title">连接 Puter（可选）</h2><p>本地打开、编辑、导出和保存项目无需账户。连接后可继续使用上游的云存储、AI 和协作功能。</p><p>Puter 是外部服务，需要联网和 Puter 账户。使用 AI 或云保存时，你选择的内容会发送给 Puter，部分能力可能消耗 Puter 额度。</p><div class="dialog-actions"><button value="cancel">继续本地使用</button><button class="primary" value="connect">连接 Puter</button></div></form>`;
  }
  root.append(d);
  d.addEventListener('click', (event) => {
    if (event.target !== d) return;
    const box = d.getBoundingClientRect();
    const e = event as MouseEvent;
    if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) d.close('cancel');
  });
  d.showModal();
  return d;
}

/** fnOS-specific chrome stays separate from the upstream editor and project data. */
export function installFnosChrome(root: HTMLElement) {
  root.addEventListener('click', (event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>('[data-fnos-support], #account');
    if (!target) return;
    if (target.hasAttribute('data-fnos-support')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      dialog(root, 'support');
      return;
    }
    if (window.puter) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const d = dialog(root, 'cloud');
    d?.addEventListener('close', () => {
      if (d.returnValue !== 'connect') return;
      target.setAttribute('aria-busy', 'true');
      void connectPuter().then(() => target.click()).catch((error: unknown) => {
        const notice = document.createElement('dialog');
        notice.className = 'fnos-dialog';
        notice.setAttribute('aria-label', '连接未完成');
        const form = document.createElement('form');
        form.method = 'dialog';
        const text = document.createElement('p');
        text.textContent = error instanceof Error ? error.message : String(error);
        const close = document.createElement('button');
        close.className = 'primary';
        close.textContent = '知道了';
        form.append(text, close);
        notice.append(form);
        root.append(notice);
        notice.addEventListener('close', () => notice.remove(), { once: true });
        notice.showModal();
      }).finally(() => target.removeAttribute('aria-busy'));
    }, { once: true });
  }, { capture: true });
}
