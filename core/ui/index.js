/**
 * Core UI Module
 * UI 컴포넌트들
 * @module core/ui
 */

/**
 * Toast 컴포넌트
 */
export class Toast {
  constructor() {
    this.container = this._createContainer();
  }
  
  _createContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 10px;
      `;
      document.body.appendChild(container);
    }
    return container;
  }
  
  /**
   * Toast 표시
   * @param {string} message 
   * @param {string} type - 'info' | 'success' | 'warning' | 'error'
   * @param {number} duration - 표시 시간 (ms)
   */
  show(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
      padding: 12px 16px;
      border-radius: 4px;
      background: ${this._getBackgroundColor(type)};
      color: white;
      font-size: 14px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      animation: slideIn 0.3s ease;
      max-width: 300px;
    `;
    toast.textContent = message;
    
    this.container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }
  
  _getBackgroundColor(type) {
    const colors = {
      info: '#2196F3',
      success: '#4CAF50',
      warning: '#FF9800',
      error: '#F44336'
    };
    return colors[type] || colors.info;
  }
}

// Toast 애니메이션 스타일 추가
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
  @keyframes slideOut {
    from { transform: translateX(0); opacity: 1; }
    to { transform: translateX(100%); opacity: 0; }
  }
`;
document.head.appendChild(style);

/**
 * Modal 컴포넌트
 */
export class Modal {
  constructor(options = {}) {
    this.options = {
      title: '',
      content: '',
      showClose: true,
      onClose: null,
      onConfirm: null,
      ...options
    };
    this.modal = null;
    this.overlay = null;
  }
  
  /**
   * 모달 표시
   */
  show() {
    this._createModal();
    document.body.style.overflow = 'hidden';
  }
  
  /**
   * 모달 닫기
   */
  close() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
    document.body.style.overflow = '';
    if (this.options.onClose) {
      this.options.onClose();
    }
  }
  
  _createModal() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'modal-overlay';
    this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
    `;
    
    this.modal = document.createElement('div');
    this.modal.className = 'modal';
    this.modal.style.cssText = `
      background: white;
      border-radius: 8px;
      max-width: 500px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    `;
    
    let html = `
      <div style="padding: 20px; border-bottom: 1px solid #eee;">
        <h2 style="margin: 0; font-size: 18px;">${this.options.title}</h2>
      </div>
      <div style="padding: 20px;">
        ${this.options.content}
      </div>
      <div style="padding: 20px; border-top: 1px solid #eee; display: flex; justify-content: flex-end; gap: 10px;">
    `;
    
    if (this.options.showClose) {
      html += `<button class="modal-close">닫기</button>`;
    }
    
    if (this.options.onConfirm) {
      html += `<button class="modal-confirm" style="background: #2196F3; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer;">확인</button>`;
    }
    
    html += '</div>';
    this.modal.innerHTML = html;
    
    this.overlay.appendChild(this.modal);
    document.body.appendChild(this.overlay);
    
    const closeBtn = this.modal.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.onclick = () => this.close();
    }
    
    const confirmBtn = this.modal.querySelector('.modal-confirm');
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        if (this.options.onConfirm) {
          this.options.onConfirm();
        }
        this.close();
      };
    }
    
    this.overlay.onclick = (e) => {
      if (e.target === this.overlay) {
        this.close();
      }
    };
  }
}

/**
 * Dialog 컴포넌트
 */
export class Dialog {
  /**
   * 확인 다이얼로그
   * @param {string} message 
   * @param {string} title 
   * @returns {Promise<boolean>}
   */
  static confirm(message, title = '확인') {
    return new Promise((resolve) => {
      const modal = new Modal({
        title,
        content: `<div style="font-size: 14px; line-height: 1.5;">${message}</div>`,
        onConfirm: () => resolve(true),
        onClose: () => resolve(false)
      });
      modal.show();
    });
  }
  
  /**
   * 알림 다이얼로그
   * @param {string} message 
   * @param {string} title 
   * @returns {Promise<void>}
   */
  static alert(message, title = '알림') {
    return new Promise((resolve) => {
      const modal = new Modal({
        title,
        content: `<div style="font-size: 14px; line-height: 1.5;">${message}</div>`,
        onConfirm: () => resolve(),
        onClose: () => resolve()
      });
      modal.show();
    });
  }
  
  /**
   * 프롬프트 다이얼로그
   * @param {string} message 
   * @param {string} defaultValue 
   * @param {string} title 
   * @returns {Promise<string|null>}
   */
  static prompt(message, defaultValue = '', title = '입력') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'text';
      input.value = defaultValue;
      input.style.cssText = 'width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 14px;';
      
      const modal = new Modal({
        title,
        content: `
          <div style="font-size: 14px; line-height: 1.5; margin-bottom: 10px;">${message}</div>
        `,
        onConfirm: () => resolve(input.value),
        onClose: () => resolve(null)
      });
      
      modal.show();
      modal.modal.querySelector('div:nth-child(2)').appendChild(input);
      input.focus();
    });
  }
}

/**
 * Banner 컴포넌트
 */
export class Banner {
  /**
   * 배너 표시
   * @param {string} message 
   * @param {string} type - 'info' | 'warning' | 'error'
   * @param {Object} options 
   */
  static show(message, type = 'info', options = {}) {
    const existing = document.getElementById('pjh-banner');
    if (existing) existing.remove();
    
    const banner = document.createElement('div');
    banner.id = 'pjh-banner';
    banner.className = `banner banner-${type}`;
    banner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      padding: 12px 20px;
      background: ${Banner._getBackgroundColor(type)};
      color: white;
      font-size: 14px;
      text-align: center;
      z-index: 10001;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    `;
    banner.textContent = message;
    
    if (options.dismissible) {
      const closeBtn = document.createElement('button');
      closeBtn.textContent = '×';
      closeBtn.style.cssText = `
        position: absolute;
        right: 20px;
        background: none;
        border: none;
        color: white;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        width: 24px;
        height: 24px;
      `;
      closeBtn.onclick = () => banner.remove();
      banner.appendChild(closeBtn);
    }
    
    document.body.appendChild(document.body, banner);
    
    if (options.duration) {
      setTimeout(() => banner.remove(), options.duration);
    }
    
    return banner;
  }
  
  static _getBackgroundColor(type) {
    const colors = {
      info: '#2196F3',
      warning: '#FF9800',
      error: '#F44336'
    };
    return colors[type] || colors.info;
  }
  
  /**
   * 배너 제거
   */
  static hide() {
    const banner = document.getElementById('pjh-banner');
    if (banner) banner.remove();
  }
}

/**
 * Context Menu 컴포넌트
 */
export class ContextMenu {
  constructor(items = []) {
    this.items = items;
    this.menu = null;
  }
  
  /**
   * 컨텍스트 메뉴 표시
   * @param {number} x 
   * @param {number} y 
   */
  show(x, y) {
    this._createMenu(x, y);
    
    const closeHandler = (e) => {
      if (!this.menu.contains(e.target)) {
        this.hide();
        document.removeEventListener('click', closeHandler);
      }
    };
    
    setTimeout(() => {
      document.addEventListener('click', closeHandler);
    }, 0);
  }
  
  /**
   * 컨텍스트 메뉴 숨기기
   */
  hide() {
    if (this.menu) {
      this.menu.remove();
      this.menu = null;
    }
  }
  
  _createMenu(x, y) {
    this.menu = document.createElement('div');
    this.menu.className = 'context-menu';
    this.menu.style.cssText = `
      position: fixed;
      left: ${x}px;
      top: ${y}px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      z-index: 10002;
      min-width: 150px;
    `;
    
    this.items.forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.className = 'context-menu-item';
      menuItem.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        font-size: 14px;
      `;
      menuItem.textContent = item.label;
      
      menuItem.onmouseover = () => {
        menuItem.style.background = '#ddd';
      };
      menuItem.onmouseout = () => {
        menuItem.style.background = '';
      };
      
      menuItem.onclick = () => {
        if (item.action) item.action();
        this.hide();
      };
      
      if (item.divider) {
        menuItem.style.borderTop = '1px solid #eee';
        menuItem.style.padding = '4px 12px';
        menuItem.style.cursor = 'default';
        menuItem.onmouseover = null;
        menuItem.onmouseout = null;
        menuItem.onclick = null;
      }
      
      this.menu.appendChild(menuItem);
    });
    
    document.body.appendChild(this.menu);
  }
}
