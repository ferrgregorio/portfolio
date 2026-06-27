import React, { useState, useEffect, useRef } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import axios from 'axios';

// ── Logo da Magius (coloque o arquivo em /public/magius-logo.png) ──
const LOGO_URL = 'img/magius-logo.png';

// ── URL base da API — lida do .env (VITE_API_URL) com fallback ──
const API = import.meta.env.VITE_API_URL || 'http://10.69.0.8:8180';

// =========================================================================
// HELPERS: CPF / CNPJ — máscara, validação e formatação
// =========================================================================
function aplicarMascaraCpfCnpj(valor) {
  const num = String(valor || '').replace(/\D/g, '').slice(0, 14);
  if (num.length <= 11) {
    // CPF: 000.000.000-00
    return num
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  // CNPJ: 00.000.000/0000-00
  return num
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

function validarCpfCnpj(valor) {
  if (!valor) return false;
  const num = String(valor).replace(/\D/g, '');

  if (num.length === 11) {
    if (/^(\d)\1{10}$/.test(num)) return false;
    let soma = 0;
    for (let i = 0; i < 9; i++) soma += parseInt(num.charAt(i)) * (10 - i);
    let dig1 = 11 - (soma % 11);
    if (dig1 >= 10) dig1 = 0;
    if (dig1 !== parseInt(num.charAt(9))) return false;
    soma = 0;
    for (let i = 0; i < 10; i++) soma += parseInt(num.charAt(i)) * (11 - i);
    let dig2 = 11 - (soma % 11);
    if (dig2 >= 10) dig2 = 0;
    return dig2 === parseInt(num.charAt(10));
  }

  if (num.length === 14) {
    if (/^(\d)\1{13}$/.test(num)) return false;
    const pesos1 = [5,4,3,2,9,8,7,6,5,4,3,2];
    const pesos2 = [6,5,4,3,2,9,8,7,6,5,4,3,2];
    let soma = 0;
    for (let i = 0; i < 12; i++) soma += parseInt(num.charAt(i)) * pesos1[i];
    let dig1 = soma % 11;
    dig1 = dig1 < 2 ? 0 : 11 - dig1;
    if (dig1 !== parseInt(num.charAt(12))) return false;
    soma = 0;
    for (let i = 0; i < 13; i++) soma += parseInt(num.charAt(i)) * pesos2[i];
    let dig2 = soma % 11;
    dig2 = dig2 < 2 ? 0 : 11 - dig2;
    return dig2 === parseInt(num.charAt(13));
  }

  return false;
}

function formatarCpfCnpjExibicao(valor) {
  if (!valor) return '';
  const num = String(valor).replace(/\D/g, '');
  if (num.length === 11) {
    return num.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (num.length === 14) {
    return num.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return valor;
}

function tipoDocumento(valor) {
  const num = String(valor || '').replace(/\D/g, '');
  if (num.length === 14) return 'CNPJ';
  return 'CPF';
}

const styles = `
  /* Fontes do sistema — sem dependência de internet */
  @font-face {
    font-family: 'Sora';
    src: local('Segoe UI'), local('Arial'), local('Helvetica Neue'), local('sans-serif');
  }
  @font-face {
    font-family: 'JetBrains Mono';
    src: local('Consolas'), local('Courier New'), local('monospace');
  }
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --blue-900: #0a1628; --blue-800: #0d2045; --blue-700: #0f2d6b; --blue-600: #1340a0;
    --blue-500: #1a52cc; --blue-400: #3b70e8; --blue-300: #6b96f0; --blue-100: #dde8ff; --blue-50: #f0f4ff;
    --red-600: #c0112a; --red-500: #e01530; --red-400: #f03050; --red-100: #fde8eb;
    --white: #ffffff; --gray-50: #f8f9fc; --gray-100: #f0f2f8; --gray-200: #e2e6f0;
    --gray-300: #c8cfdf; --gray-400: #9aa3b8; --gray-500: #6b7590; --gray-700: #3a4260; --gray-900: #1a1f35;
    --success: #0d8f5c; --success-bg: #e6f7f1; --warning: #b45309; --warning-bg: #fef3c7;
    --info: #0369a1; --info-bg: #e0f2fe;
    --shadow-sm: 0 1px 3px rgba(10,22,40,0.08), 0 1px 2px rgba(10,22,40,0.06);
    --shadow-lg: 0 10px 30px rgba(10,22,40,0.16), 0 4px 12px rgba(10,22,40,0.10);
    --shadow-xl: 0 20px 50px rgba(10,22,40,0.2);
    --radius-sm: 6px; --radius: 10px; --radius-lg: 16px; --radius-xl: 24px;
    --transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);

    /* Tokens semânticos (light) */
    --bg-app: var(--gray-50);
    --bg-card: var(--white);
    --bg-elevated: var(--white);
    --bg-input: var(--white);
    --bg-muted: var(--gray-50);
    --bg-muted-strong: var(--gray-100);
    --border-default: var(--gray-200);
    --border-strong: var(--gray-300);
    --text-strong: var(--gray-900);
    --text-default: var(--gray-700);
    --text-muted: var(--gray-500);
    --text-soft: var(--gray-400);
    --text-on-card-title: var(--blue-800);
    --table-header-bg: var(--gray-50);
    --table-row-hover: var(--blue-50);
    --modal-overlay-bg: rgba(10,22,40,0.75);
    --logo-filter: none;
    --page-gradient: transparent;
  }

  /* ===== TEMA ESCURO — paleta institucional Magius ===== */
  .theme-dark {
    --bg-app: #0a1628;
    --bg-card: #11203d;
    --bg-elevated: #142848;
    --bg-input: #0d1d36;
    --bg-muted: #0f2244;
    --bg-muted-strong: #16294b;
    --border-default: #233a64;
    --border-strong: #2c4878;
    --text-strong: #e8eefb;
    --text-default: #c5d1e8;
    --text-muted: #8a9ec4;
    --text-soft: #6b7fa0;
    --text-on-card-title: #93b4ff;
    --table-header-bg: #16294b;
    --table-row-hover: #18305a;
    --modal-overlay-bg: rgba(2,8,20,0.85);
    --logo-filter: brightness(0) invert(1);
    --page-gradient: radial-gradient(ellipse 80% 50% at 10% -10%, rgba(59,112,232,0.20) 0%, transparent 60%), radial-gradient(ellipse 60% 40% at 90% 110%, rgba(224,21,48,0.12) 0%, transparent 60%), #0a1628;
    --shadow-sm: 0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4);
    --shadow-lg: 0 10px 30px rgba(0,0,0,0.55), 0 4px 12px rgba(0,0,0,0.4);
    --shadow-xl: 0 20px 50px rgba(0,0,0,0.65);

    /* Cores funcionais ajustadas pra contraste no escuro */
    --success-bg: rgba(13,143,92,0.18);
    --warning-bg: rgba(180,83,9,0.22);
    --info-bg: rgba(3,105,161,0.22);
    --red-100: rgba(224,21,48,0.18);
    --blue-50: #18305a;
    --blue-100: #1f3d72;
  }

  /* Sobrescritas específicas no modo dark — só nos pontos onde as cores estavam hardcoded */
  .theme-dark body, body.theme-dark { background: var(--bg-app); color: var(--text-strong); }
  .theme-dark .card-title::after { background: var(--border-default); }
  .theme-dark .card-title { color: #93b4ff; }
  .theme-dark .card-title--danger { color: #ff7a8a; }
  .theme-dark .modal-content { background: var(--bg-card); color: var(--text-default); }
  .theme-dark .modal-close-btn { background: var(--bg-muted-strong); color: var(--text-default); }
  .theme-dark .topbar { background: var(--bg-card); border-color: var(--border-default); }
  .theme-dark .topbar-user { color: var(--text-muted); }
  .theme-dark .topbar-user strong { color: var(--text-strong); }
  .theme-dark .topbar-divider { background: var(--border-default); }
  .theme-dark .btn-logout { background: var(--bg-muted-strong); color: var(--text-default); border-color: var(--border-default); }
  .theme-dark .nav-tabs { background: var(--bg-card); border-color: var(--border-default); }
  .theme-dark .nav-tab { color: var(--text-muted); }
  .theme-dark .nav-tab:hover { background: var(--bg-muted); color: var(--text-strong); }
  .theme-dark .card { background: var(--bg-card); border-color: var(--border-default); color: var(--text-default); }
  .theme-dark .form-label { color: var(--text-muted); }
  .theme-dark .form-input, .theme-dark .form-select { background: var(--bg-input); color: var(--text-strong); border-color: var(--border-default); }
  .theme-dark .form-input::placeholder { color: var(--text-soft); }
  .theme-dark .form-input:focus, .theme-dark .form-select:focus { border-color: var(--blue-400); }
  .theme-dark .equip-section { background: var(--bg-muted); border-color: var(--border-default); }
  .theme-dark .equip-row { background: var(--bg-elevated); border-color: var(--border-default); }
  .theme-dark .btn-ghost { background: var(--bg-muted-strong); color: var(--text-default); border-color: var(--border-default); }
  .theme-dark .table-wrap { border-color: var(--border-default); }
  .theme-dark .data-table thead tr { background: var(--table-header-bg); border-bottom-color: var(--border-default); }
  .theme-dark .data-table th { color: var(--text-muted); }
  .theme-dark .data-table tbody tr { border-bottom-color: var(--border-default); }
  .theme-dark .data-table tbody tr:hover { background: var(--table-row-hover); }
  .theme-dark .data-table td { color: var(--text-default); }
  .theme-dark .data-table td.bold { color: var(--text-strong); }
  .theme-dark .data-table td.mono { color: var(--text-muted); }
  .theme-dark .toolbar { background: var(--bg-muted); border-color: var(--border-default); }
  .theme-dark .toolbar-info { color: var(--text-default); }
  .theme-dark .search-input { background: var(--bg-input); color: var(--text-strong); border-color: var(--border-default); }
  .theme-dark .logs-wrap .log-row { border-bottom-color: var(--border-default); }
  .theme-dark .log-row:hover { background: var(--bg-muted); }
  .theme-dark .log-action { color: var(--text-default); }
  .theme-dark .log-expanded { background: var(--bg-muted); border-bottom-color: var(--border-default); }
  .theme-dark .log-exp-text { color: var(--text-default); }
  .theme-dark .role-operator { background: var(--blue-100); color: var(--text-strong); border-color: var(--blue-400); }
  .theme-dark .empty-state { color: var(--text-soft); }

  /* Botão de toggle de tema */
  /* ── TOGGLE SWITCH TEMA ── */
  .theme-toggle-wrap { position: relative; width: 52px; height: 28px; cursor: pointer; flex-shrink: 0; margin-right: 10px; }
  .theme-toggle-track { position: absolute; inset: 0; border-radius: 14px; transition: all 0.35s cubic-bezier(0.4,0,0.2,1); display: flex; align-items: center; padding: 0 7px; }
  .theme-toggle-track.light { background: linear-gradient(135deg,#dde8ff,#e8f0ff); border: 1.5px solid #b5c8f0; justify-content: flex-start; }
  .theme-toggle-track.dark  { background: linear-gradient(135deg,#1340a0,#0d2045); border: 1.5px solid #3b70e8; justify-content: flex-end; }
  .theme-toggle-thumb { position: absolute; top: 3px; width: 20px; height: 20px; border-radius: 50%; box-shadow: 0 2px 8px rgba(0,0,0,0.2); transition: all 0.35s cubic-bezier(0.34,1.56,0.64,1); }
  .theme-toggle-thumb.light { left: 3px; background: #fff; border: 1px solid #dde8ff; box-shadow: 0 2px 8px rgba(59,112,232,0.2); }
  .theme-toggle-thumb.dark  { left: 29px; background: #0a1628; border: 1px solid #1e3560; box-shadow: 0 2px 8px rgba(0,0,0,0.4); }
  .topbar-actions { display: flex; align-items: center; gap: 0; }
  /* Botão sair — texto escuro no light, claro no dark */
  .btn-logout { padding: 8px 16px; background: var(--gray-100); color: #3a4260; border: 1px solid var(--gray-200); border-radius: var(--radius-sm); font-family: 'Segoe UI', Arial, Helvetica, sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; transition: var(--transition); }

  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; background: var(--bg-app); color: var(--text-strong); min-height: 100vh; -webkit-font-smoothing: antialiased; transition: background 0.3s ease, color 0.3s ease; }
  .page-bg { min-height: 100vh; background: var(--page-gradient); transition: background 0.3s ease; position: relative; overflow-x: hidden; }
  .page-bg > *:not(.slime-canvas):not(.slime-grid) { position: relative; z-index: 2; }
  .topbar-logo-img, .login-logo-img, .sign-header-logo { transition: filter 0.3s ease; }
  .theme-dark .topbar-logo-img { filter: var(--logo-filter); }

  /* MODAIS */
  .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: var(--modal-overlay-bg); backdrop-filter: blur(5px); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 20px; }
  .modal-content { background: #fff; border-radius: var(--radius-lg); width: 100%; max-width: 800px; max-height: 90vh; overflow-y: auto; padding: 40px; box-shadow: var(--shadow-xl); animation: slideUp 0.3s ease; position: relative; }
  .modal-close-btn { position: absolute; top: 20px; right: 20px; background: var(--gray-100); border: none; width: 36px; height: 36px; border-radius: 50%; font-size: 16px; cursor: pointer; color: var(--gray-700); transition: var(--transition); }
  .modal-close-btn:hover { background: var(--red-100); color: var(--red-600); }
  .assinatura-box { margin-top: 30px; padding: 20px; background: var(--success-bg); border: 2px dashed var(--success); border-radius: var(--radius); color: var(--success); text-align: center; }
  .assinatura-box strong { display: block; font-size: 16px; margin-bottom: 8px; color: #0a7d51; }
  .assinatura-box span { display: block; font-size: 13px; margin-bottom: 4px; color: #0d8f5c; font-family: Consolas, 'Courier New', monospace; }

  /* LOGIN */
  /* ── SLIME CANVAS ── */
  .slime-canvas { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; }
  .slime-grid { position: fixed; top: 0; left: 0; width: 100%; height: 100%; z-index: 0; pointer-events: none; background-image: linear-gradient(rgba(59,112,232,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(59,112,232,0.04) 1px, transparent 1px); background-size: 44px 44px; }

  .login-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: #f0f4ff; position: relative; overflow: hidden; }
  .login-wrap > *:not(.slime-canvas):not(.slime-grid) { position: relative; z-index: 2; }
  .login-card { width: 100%; max-width: 420px; background: rgba(255,255,255,0.85); border: 1px solid rgba(19,64,160,0.12); border-radius: var(--radius-xl); padding: 48px 40px; backdrop-filter: blur(16px); box-shadow: 0 16px 48px rgba(19,64,160,0.12), inset 0 1px 0 rgba(255,255,255,0.9); animation: slideUp 0.5s cubic-bezier(0.4,0,0.2,1); }
  .login-logo-area { text-align: center; margin-bottom: 36px; }
  .login-logo-img { width: 200px; height: auto; display: block; margin: 0 auto 16px; filter: none; }
  .login-subtitle { font-size: 13px; color: #9aa3b8; font-weight: 400; letter-spacing: 0.5px; text-transform: uppercase; }
  .login-label { display: block; font-size: 12px; font-weight: 600; color: #6b7590; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 8px; }
  .login-input { width: 100%; padding: 13px 16px; background: rgba(255,255,255,0.9); border: 1.5px solid #e2e6f0; border-radius: var(--radius); color: #1a1f35; font-family: 'Segoe UI', Arial, Helvetica, sans-serif; font-size: 15px; outline: none; transition: var(--transition); margin-bottom: 20px; }
  .login-input::placeholder { color: #c8cfdf; }
  .login-input:focus { border-color: var(--blue-400); background: #fff; box-shadow: 0 0 0 3px rgba(59,112,232,0.12); }
  .login-btn { width: 100%; padding: 14px; background: linear-gradient(135deg, var(--blue-500), var(--blue-600)); color: #fff; border: none; border-radius: var(--radius); font-family: 'Segoe UI', Arial, Helvetica, sans-serif; font-size: 15px; font-weight: 700; cursor: pointer; transition: var(--transition); letter-spacing: 0.3px; box-shadow: 0 4px 16px rgba(19,64,160,0.4); }
  .login-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(19,64,160,0.5); }
  .login-error { background: rgba(224,21,48,0.15); border: 1px solid rgba(224,21,48,0.3); color: #ff6b7a; padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; font-weight: 500; text-align: center; margin-bottom: 16px; animation: shake 0.3s ease; }

  /* SHELL */
  .app-shell { max-width: 1100px; margin: 0 auto; padding: 24px 20px; animation: fadeIn 0.4s ease; }
  .topbar { display: flex; align-items: center; justify-content: space-between; background: var(--white); border: 1px solid var(--gray-200); border-radius: var(--radius-lg); padding: 10px 24px; margin-bottom: 20px; box-shadow: var(--shadow-sm); }
  .topbar-brand { display: flex; align-items: center; gap: 16px; }
  .topbar-logo-img { height: 36px; width: auto; display: block; object-fit: contain; }
  .topbar-divider { width: 1px; height: 24px; background: var(--gray-200); }
  .topbar-user { font-size: 13px; color: var(--gray-500); }
  .topbar-user strong { color: var(--gray-700); font-weight: 600; }
  .topbar-badge { display: inline-block; padding: 2px 8px; background: var(--blue-100); color: var(--blue-600); border-radius: 20px; font-size: 10px; font-weight: 700; text-transform: uppercase; margin-left: 6px; }
  .topbar-badge.admin { background: rgba(224,21,48,0.1); color: var(--red-600); }
  .topbar-badge.sesmt { background: var(--success-bg); color: var(--success); }
  /* btn-logout já definido acima */
  .btn-logout:hover { background: var(--red-100); color: var(--red-600); border-color: var(--red-400); }

  .nav-tabs { display: flex; flex-wrap: wrap; gap: 6px; background: var(--white); border: 1px solid var(--gray-200); border-radius: var(--radius-lg); padding: 6px; margin-bottom: 24px; box-shadow: var(--shadow-sm); }
  .nav-tab { padding: 10px 20px; border: none; border-radius: var(--radius); font-family: 'Segoe UI', Arial, Helvetica, sans-serif; font-size: 13.5px; font-weight: 600; cursor: pointer; color: var(--gray-500); background: transparent; transition: var(--transition); display: flex; align-items: center; gap: 7px; white-space: nowrap; }
  .nav-tab:hover { background: var(--gray-50); color: var(--gray-700); }
  .nav-tab.active { background: linear-gradient(135deg, var(--blue-600), var(--blue-500)); color: #fff; box-shadow: 0 3px 10px rgba(19,64,160,0.3); }

  .card { background: var(--white); border: 1px solid var(--gray-200); border-radius: var(--radius-lg); padding: 28px; box-shadow: var(--shadow-sm); animation: fadeIn 0.3s ease; }
  .card-title { font-size: 18px; font-weight: 700; color: var(--blue-800); margin-bottom: 24px; display: flex; align-items: center; gap: 10px; }
  .card-title::after { content: ''; flex: 1; height: 1px; background: var(--gray-200); margin-left: 8px; }

  .form-row { display: flex; gap: 16px; margin-bottom: 16px; }
  .form-group { display: flex; flex-direction: column; }
  .form-group.flex-2 { flex: 2; }
  .form-group.flex-1 { flex: 1; }
  .form-label { font-size: 12px; font-weight: 600; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 7px; }
  .form-input, .form-select { padding: 11px 14px; border: 1.5px solid var(--gray-200); border-radius: var(--radius); font-family: 'Segoe UI', Arial, Helvetica, sans-serif; font-size: 14px; color: var(--gray-900); background: var(--white); outline: none; transition: var(--transition); width: 100%; }
  .form-input:focus, .form-select:focus { border-color: var(--blue-400); box-shadow: 0 0 0 3px rgba(59,112,232,0.12); }
  .form-input.invalid { border-color: var(--red-400); background: #fff5f6; }
  .form-input.invalid:focus { box-shadow: 0 0 0 3px rgba(224,21,48,0.12); }
  .form-input.valid { border-color: var(--success); }
  .form-hint { font-size: 11.5px; margin-top: 5px; color: var(--gray-400); display: flex; align-items: center; gap: 4px; }
  .form-hint.error { color: var(--red-500); font-weight: 600; }
  .form-hint.ok { color: var(--success); font-weight: 600; }

  .equip-section { background: var(--gray-50); border: 1.5px dashed var(--gray-200); border-radius: var(--radius-lg); padding: 24px; margin-bottom: 24px; }
  .equip-section-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--gray-400); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
  .equip-row { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; padding: 12px; background: var(--white); border: 1px solid var(--gray-200); border-radius: var(--radius); transition: var(--transition); animation: slideIn 0.2s ease; }
  .equip-row:hover { border-color: var(--blue-300); box-shadow: var(--shadow-sm); }
  .equip-row .form-input, .equip-row .form-select { padding: 9px 12px; font-size: 13.5px; }

  .btn { padding: 10px 18px; border: none; border-radius: var(--radius); font-family: 'Segoe UI', Arial, Helvetica, sans-serif; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: var(--transition); display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
  .btn:hover { transform: translateY(-1px); }
  .btn-primary { background: linear-gradient(135deg, var(--blue-500), var(--blue-600)); color: #fff; box-shadow: 0 3px 10px rgba(19,64,160,0.3); }
  .btn-primary:disabled { background: var(--gray-200); color: var(--gray-400); box-shadow: none; cursor: not-allowed; transform: none; }
  .btn-danger { background: linear-gradient(135deg, var(--red-500), var(--red-600)); color: #fff; box-shadow: 0 3px 8px rgba(224,21,48,0.25); }
  .btn-danger:disabled { background: var(--gray-200); color: var(--gray-400); box-shadow: none; cursor: not-allowed; transform: none; }
  .btn-success { background: linear-gradient(135deg, #10a974, var(--success)); color: #fff; box-shadow: 0 3px 8px rgba(13,143,92,0.3); }
  .btn-ghost { background: var(--gray-100); color: var(--gray-700); border: 1px solid var(--gray-200); }
  .btn-info { background: linear-gradient(135deg, #17b3cc, #0ea5bb); color: #fff; box-shadow: 0 3px 8px rgba(14,165,187,0.25); }
  .btn-warning { background: linear-gradient(135deg, #f5a623, #e09010); color: #fff; box-shadow: 0 3px 8px rgba(240,166,35,0.3); }
  .btn-sm { padding: 7px 13px; font-size: 12.5px; }
  .btn-icon-only { padding: 8px 10px; background: var(--red-100); color: var(--red-600); border: 1px solid rgba(224,21,48,0.15); }
  .btn-icon-only:hover { background: var(--red-500); color: #fff; }
  .btn-full { width: 100%; justify-content: center; padding: 14px; font-size: 15px; }

  .table-wrap { border: 1px solid var(--gray-200); border-radius: var(--radius-lg); overflow: hidden; box-shadow: var(--shadow-sm); }
  .data-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .data-table thead tr { background: var(--gray-50); border-bottom: 2px solid var(--gray-200); }
  .data-table th { padding: 12px 16px; text-align: left; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; color: var(--gray-500); }
  .data-table th.center, .data-table td.center { text-align: center; }
  .data-table tbody tr { border-bottom: 1px solid var(--gray-100); transition: var(--transition); }
  .data-table tbody tr:hover { background: var(--blue-50); }
  .data-table td { padding: 13px 16px; color: var(--gray-700); }
  .data-table td.bold { font-weight: 600; color: var(--gray-900); }
  .data-table td.mono { font-family: Consolas, 'Courier New', monospace; font-size: 13px; color: var(--gray-500); }
  .data-table input[type="checkbox"] { width: 16px; height: 16px; accent-color: var(--blue-500); cursor: pointer; }

  .status-badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: 600; transition: var(--transition); }
  .status-badge::before { content: ''; width: 6px; height: 6px; border-radius: 50%; }
  .status-digital { background: var(--success-bg); color: var(--success); }
  .status-digital::before { background: var(--success); }
  .status-digital:hover { background: #d1f0e4; transform: translateY(-1px); }
  .status-fisico { background: var(--info-bg); color: var(--info); }
  .status-fisico::before { background: var(--info); }
  .status-fisico:hover { background: #cceafc; transform: translateY(-1px); }
  .status-pendente { background: var(--warning-bg); color: var(--warning); }
  .status-pendente::before { background: var(--warning); }

  .toolbar { display: flex; justify-content: space-between; align-items: center; background: var(--blue-50); border: 1px solid var(--blue-100); border-radius: var(--radius); padding: 12px 16px; margin-bottom: 16px; }
  .toolbar-info { font-size: 13.5px; color: var(--blue-700); font-weight: 500; }
  .toolbar-actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .toolbar-warning { background: var(--warning-bg); border-color: #fde68a; }
  .toolbar-warning .toolbar-info { color: var(--warning); }

  .search-bar { display: flex; gap: 10px; margin-bottom: 24px; }
  .search-input-wrap { flex: 1; position: relative; }
  .search-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: var(--gray-400); font-size: 16px; pointer-events: none; }
  .search-input { width: 100%; padding: 12px 14px 12px 42px; border: 1.5px solid var(--gray-200); border-radius: var(--radius); font-family: 'Segoe UI', Arial, Helvetica, sans-serif; font-size: 14px; color: var(--gray-900); outline: none; transition: var(--transition); }
  .search-input:focus { border-color: var(--blue-400); box-shadow: 0 0 0 3px rgba(59,112,232,0.12); }

  .collab-header { background: linear-gradient(135deg, var(--blue-800), var(--blue-700)); border-radius: var(--radius-lg); padding: 20px 24px; margin-bottom: 20px; color: #fff; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px; }
  .collab-name { font-size: 20px; font-weight: 700; margin-bottom: 6px; }
  .collab-meta { display: flex; gap: 16px; flex-wrap: wrap; }
  .collab-meta-item { font-size: 13px; color: rgba(255,255,255,0.65); display: flex; align-items: center; gap: 5px; }
  .collab-meta-item strong { color: rgba(255,255,255,0.9); font-weight: 600; }
  .collab-actions { display: flex; gap: 8px; flex-wrap: wrap; }

  .logs-wrap { max-height: 450px; overflow-y: auto; scrollbar-width: thin; scrollbar-color: var(--gray-300) transparent; }
  .log-row { padding: 14px 16px; border-bottom: 1px solid var(--gray-100); display: flex; gap: 16px; align-items: center; cursor: pointer; transition: var(--transition); }
  .log-row:hover { background: var(--gray-50); }
  .log-time { font-family: Consolas, 'Courier New', monospace; font-size: 11.5px; color: var(--gray-400); white-space: nowrap; min-width: 130px; }
  .log-user { font-size: 13px; font-weight: 700; color: var(--blue-600); white-space: nowrap; min-width: 120px; }
  .log-action { font-size: 13px; color: var(--gray-700); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .log-chevron { color: var(--gray-400); font-size: 12px; margin-left: auto; transition: var(--transition); }
  
  .log-expanded { padding: 16px 24px; background: var(--gray-50); border-bottom: 1px solid var(--gray-200); border-left: 3px solid var(--blue-500); animation: fadeIn 0.2s ease; }
  .log-expanded.red { border-left-color: var(--red-500); background: #fdf5f6; }
  .log-exp-title { font-size: 11px; font-weight: 700; color: var(--gray-500); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
  .log-exp-text { font-size: 13.5px; color: var(--gray-800); margin-bottom: 12px; line-height: 1.6; word-break: break-word; }

  .users-layout { display: flex; gap: 20px; align-items: flex-start; }
  .users-form { width: 300px; flex-shrink: 0; }
  .users-list { flex: 1; }
  .role-select { padding: 5px 10px; border-radius: var(--radius-sm); font-family: 'Segoe UI', Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 700; border: 1.5px solid transparent; cursor: pointer; transition: var(--transition); outline: none; }
  .role-admin { background: rgba(224,21,48,0.1); color: var(--red-600); border-color: rgba(224,21,48,0.2); }
  .role-operator { background: var(--blue-100); color: var(--blue-700); border-color: var(--blue-200); }
  .role-sesmt { background: var(--success-bg); color: var(--success); border-color: rgba(13,143,92,0.2); }

  /* SIGN PAGE */
  .sign-page { min-height: 100vh; background: var(--gray-50); padding: 40px 20px; }
  .sign-card { max-width: 820px; margin: 0 auto; background: var(--white); border-radius: var(--radius-xl); box-shadow: var(--shadow-xl); overflow: hidden; }
  .sign-header { background: linear-gradient(135deg, var(--blue-800), var(--blue-700)); padding: 24px 40px; display: flex; align-items: center; gap: 20px; }
  .sign-header-logo { height: 38px; width: auto; display: block; object-fit: contain; filter: brightness(0) invert(1); flex-shrink: 0; }
  .sign-header-divider { width: 1px; height: 44px; background: rgba(255,255,255,0.2); flex-shrink: 0; }
  .sign-header-title { color: #fff; font-size: 18px; font-weight: 700; }
  .sign-header-sub { color: rgba(255,255,255,0.55); font-size: 13px; margin-top: 3px; }
  .sign-body { padding: 40px; }
  .sign-doc-text { font-size: 14px; line-height: 1.75; color: var(--gray-700); text-align: justify; margin-bottom: 14px; }
  .sign-section-title { font-size: 12.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: var(--blue-700); margin: 20px 0 8px; padding-bottom: 6px; border-bottom: 2px solid var(--blue-100); }
  .sign-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
  .sign-table thead { background: var(--gray-50); }
  .sign-table th { padding: 10px 14px; text-align: left; font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--gray-500); border: 1px solid var(--gray-200); }
  .sign-table td { padding: 10px 14px; border: 1px solid var(--gray-200); color: var(--gray-700); }
  .sign-table .center { text-align: center; }
  .sign-confirm-btn { width: 100%; padding: 18px; font-size: 17px; font-weight: 800; background: linear-gradient(135deg, var(--success), #0a7d51); color: #fff; border: none; border-radius: var(--radius-lg); cursor: pointer; margin-top: 30px; transition: var(--transition); box-shadow: 0 6px 20px rgba(13,143,92,0.35); }
  .sign-confirm-btn:hover { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(13,143,92,0.45); }
  .sign-confirm-note { text-align: center; font-size: 12px; color: var(--gray-400); margin-top: 10px; }
  .sign-result { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 40px; }
  .sign-result-card { text-align: center; background: var(--white); border-radius: var(--radius-xl); padding: 60px 48px; box-shadow: var(--shadow-lg); animation: slideUp 0.5s ease; }
  .sign-result-icon { font-size: 64px; margin-bottom: 20px; }
  .sign-result-title { font-size: 24px; font-weight: 700; margin-bottom: 10px; }
  .sign-result-sub { font-size: 15px; color: var(--gray-500); }
  .sign-result-success .sign-result-title { color: var(--success); }
  .sign-result-error .sign-result-title { color: var(--red-500); }

  @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes slideUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes slideIn { from { opacity: 0; transform: translateX(-8px); } to { opacity: 1; transform: translateX(0); } }
  @keyframes shake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 60% { transform: translateX(6px); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  .spinner { width: 40px; height: 40px; border: 3px solid var(--blue-100); border-top-color: var(--blue-500); border-radius: 50%; animation: spin 0.7s linear infinite; margin: 0 auto 20px; }
  .loading-center { min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--gray-500); font-size: 15px; }
  #inventario-lote-pdf { display: none; }
  .empty-state { text-align: center; padding: 48px 24px; color: var(--gray-400); }
  .empty-state-icon { font-size: 40px; margin-bottom: 12px; }
  .empty-state-text { font-size: 15px; font-weight: 500; }
  .empty-state-sub { font-size: 13px; margin-top: 4px; }
  /* ── TOASTS ── */
  .toast-container-fixed { position:fixed; bottom:24px; right:24px; display:flex; flex-direction:column; gap:10px; z-index:99999; pointer-events:none; }
  .toast-item { display:flex; align-items:flex-start; gap:12px; padding:14px 18px; border-radius:14px; min-width:300px; max-width:380px; pointer-events:all; background:#fff; box-shadow:0 8px 32px rgba(0,0,0,0.12); transform:translateX(120%); opacity:0; transition:all 0.4s cubic-bezier(0.4,0,0.2,1); position:relative; overflow:hidden; }
  .toast-item.show { transform:translateX(0); opacity:1; }
  .toast-item.hide { transform:translateX(120%); opacity:0; }
  .toast-item.toast-success { border-left:4px solid #0d8f5c; }
  .toast-item.toast-error   { border-left:4px solid #e01530; }
  .toast-item.toast-info    { border-left:4px solid #1340a0; }
  .toast-item.toast-warning { border-left:4px solid #f5a623; }
  .toast-icon-wrap { width:36px; height:36px; border-radius:10px; display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:16px; }
  .toast-success .toast-icon-wrap { background:rgba(13,143,92,0.1); }
  .toast-error   .toast-icon-wrap { background:rgba(224,21,48,0.1); }
  .toast-info    .toast-icon-wrap { background:rgba(19,64,160,0.1); }
  .toast-warning .toast-icon-wrap { background:rgba(245,166,35,0.1); }
  .toast-body-wrap { flex:1; }
  .toast-title-text { font-size:13.5px; font-weight:700; color:#1a1f35; margin-bottom:2px; }
  .toast-msg-text { font-size:12.5px; color:#6b7590; line-height:1.5; }
  .toast-close-btn { background:none; border:none; color:#9aa3b8; font-size:16px; cursor:pointer; padding:0; transition:color 0.2s; flex-shrink:0; }
  .toast-close-btn:hover { color:#3a4260; }
  .toast-progress { position:absolute; bottom:0; left:0; height:3px; border-radius:0 3px 0 0; animation:toastShrink var(--dur) linear forwards; }
  .toast-success .toast-progress { background:linear-gradient(90deg,#0d8f5c,#10a974); }
  .toast-error   .toast-progress { background:linear-gradient(90deg,#c0112a,#e01530); }
  .toast-info    .toast-progress { background:linear-gradient(90deg,#1340a0,#1a52cc); }
  .toast-warning .toast-progress { background:linear-gradient(90deg,#e09010,#f5a623); }
  @keyframes toastShrink { from{width:100%} to{width:0} }

  /* ── MODAL EMAIL ── */
  .email-modal-overlay { position:fixed; inset:0; background:rgba(10,22,40,0.6); backdrop-filter:blur(6px); display:flex; align-items:center; justify-content:center; z-index:9998; padding:20px; animation:fadeIn 0.25s ease; }
  .email-modal { background:#fff; border-radius:20px; padding:36px; width:100%; max-width:440px; box-shadow:0 24px 64px rgba(10,22,40,0.2); animation:slideUp 0.3s cubic-bezier(0.4,0,0.2,1); }
  .theme-dark .email-modal { background:var(--bg-card); }
  .email-modal-icon { width:52px; height:52px; background:linear-gradient(135deg,#1340a0,#1a52cc); border-radius:14px; display:flex; align-items:center; justify-content:center; margin-bottom:20px; box-shadow:0 6px 20px rgba(19,64,160,0.3); }
  .email-modal-title { font-size:19px; font-weight:800; color:#1a1f35; margin-bottom:6px; }
  .theme-dark .email-modal-title { color:var(--text-strong); }
  .email-modal-sub { font-size:13px; color:#6b7590; line-height:1.6; margin-bottom:24px; }
  .theme-dark .email-modal-sub { color:var(--text-muted); }
  .email-modal-actions { display:flex; gap:10px; margin-top:28px; }
  .btn-email-cancel { flex:1; padding:13px; background:#fff; color:#3a4260; border:1.5px solid #c8cfdf; border-radius:10px; font-family:'Segoe UI',Arial,sans-serif; font-size:14px; font-weight:600; cursor:pointer; transition:all 0.2s; }
  .btn-email-cancel:hover { background:#f0f2f8; }
  .theme-dark .btn-email-cancel { background:var(--bg-muted); color:var(--text-default); border-color:var(--border-default); }
  .btn-email-send { flex:2; padding:13px; background:linear-gradient(135deg,#1a52cc,#1340a0); color:#fff; border:none; border-radius:10px; font-family:'Segoe UI',Arial,sans-serif; font-size:14px; font-weight:700; cursor:pointer; transition:all 0.2s; box-shadow:0 4px 14px rgba(19,64,160,0.35); display:flex; align-items:center; justify-content:center; gap:8px; }
  .btn-email-send:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 8px 20px rgba(19,64,160,0.45); }
  .btn-email-send:disabled { background:#c8cfdf; box-shadow:none; cursor:not-allowed; }

  @media (max-width: 700px) {
    .form-row { flex-direction: column; }
    .users-layout { flex-direction: column; }
    .users-form { width: 100%; }
    .collab-header { flex-direction: column; align-items: flex-start; }
    .toolbar { flex-direction: column; align-items: flex-start; gap: 10px; }
    .topbar-logo-img { height: 28px; }
  }

  /* ===== Overrides finais do modo dark ===== */
  .theme-dark .sign-page { background: var(--bg-app); }
  .theme-dark .sign-card { background: var(--bg-card); }
  .theme-dark .sign-body { color: var(--text-default); }
  .theme-dark .sign-doc-text { color: var(--text-default); }
  .theme-dark .sign-section-title { color: var(--blue-300); border-bottom-color: var(--border-strong); }
  .theme-dark .sign-table thead { background: var(--bg-muted-strong); }
  .theme-dark .sign-table th { color: var(--text-muted); border-color: var(--border-default); }
  .theme-dark .sign-table td { color: var(--text-default); border-color: var(--border-default); }
  .theme-dark .sign-table td[style*="background: var(--gray-50)"] { background: var(--bg-muted-strong) !important; }
  .theme-dark .sign-confirm-note { color: var(--text-soft); }
  .theme-dark .sign-result-card { background: var(--bg-card); }
  .theme-dark .sign-result-sub { color: var(--text-muted); }
  .theme-dark .loading-center { color: var(--text-muted); }

  /* PDF de comprovante interno: sempre claro mesmo no dark (pra impressão decente) */
  #comprovante-print-area { background: #fff; color: #1a1f35; padding: 10px; border-radius: var(--radius); }
  .theme-dark #comprovante-print-area .sign-doc-text { color: #3a4260; }
  .theme-dark #comprovante-print-area .sign-table th { color: #6b7590; border-color: #e2e6f0; background: #f8f9fc; }
  .theme-dark #comprovante-print-area .sign-table td { color: #3a4260; border-color: #e2e6f0; }

  /* ===== ABA "Baixas e Exclusões" — visual coerente em light e dark ===== */
  .card-title--danger { color: var(--red-600); }
  .theme-dark .card-title--danger { color: #ff7a8a; }

  .logs-wrap--danger { border-top: 3px solid var(--red-400); }

  /* Linha de log de baixa — light mode: fundo rosado claro */
  .log-row--baixa { background: var(--red-100); }
  .log-row--baixa .log-time { color: var(--gray-700); }
  .log-row--baixa .log-user { color: var(--red-600); }
  .log-row--baixa .log-action { color: var(--gray-900); }
  .log-row--baixa .log-chevron { color: var(--red-500); }
  .log-row--baixa:hover { background: #fbd5db; }

  /* Override no dark: fundo bem suave, texto claro e legível, acento vermelho */
  .theme-dark .log-row--baixa { background: rgba(224,21,48,0.08); border-left: 3px solid var(--red-500); }
  .theme-dark .log-row--baixa:hover { background: rgba(224,21,48,0.14); }
  .theme-dark .log-row--baixa .log-time { color: #b5c2dc; }
  .theme-dark .log-row--baixa .log-user { color: #ff7a8a; font-weight: 700; }
  .theme-dark .log-row--baixa .log-action { color: #e8eefb; }
  .theme-dark .log-row--baixa .log-chevron { color: #ff7a8a; }

  /* Detalhe expandido */
  .log-exp-title--baixa { color: var(--red-400); }
  .theme-dark .log-exp-title--baixa { color: #ff9aa6; }
  .theme-dark .log-expanded.red { background: rgba(224,21,48,0.06); border-left-color: var(--red-500); }
  .theme-dark .log-expanded.red .log-exp-text { color: var(--text-default); }
`;

function FotoThumb({ eq }) {
  const [lb, setLb] = useState(false);
  if (!eq.fotoEquipamento) return null;
  const url = `${API}${eq.fotoEquipamento}`;
  const isPdf = eq.fotoEquipamento.endsWith('.pdf');
  return (
    <>
      {isPdf ? (
        <a href={url} target="_blank" rel="noreferrer" style={{fontSize:'20px',textDecoration:'none'}} title="Ver PDF">📄</a>
      ) : (
        <img src={url} alt="foto"
          style={{width:'44px',height:'44px',minWidth:'44px',maxWidth:'44px',maxHeight:'44px',objectFit:'cover',borderRadius:'6px',border:'2px solid var(--border-default)',cursor:'pointer',display:'block'}}
          onClick={()=>setLb(true)}/>
      )}
      {lb && (
        <div className="foto-lightbox" onClick={()=>setLb(false)}>
          <span className="foto-lightbox-close">✕</span>
          <img src={url} alt="foto" style={{maxWidth:'90vw',maxHeight:'85vh',objectFit:'contain',borderRadius:'8px'}}/>
        </div>
      )}
    </>
  );
}

function StatusBadge({ eq, onAbrirComprovante }) {
  if (eq.statusAssinatura === 'Assinado Digitalmente') {
    if (eq.caminhoArquivo) {
      return (
        <a href={`${API}${eq.caminhoArquivo}`} target="_blank" rel="noreferrer" style={{textDecoration: 'none'}}>
          <span className="status-badge status-digital" style={{cursor: 'pointer'}}>
            ✔ Assinado Digitalmente (Abrir PDF)
          </span>
        </a>
      );
    }
    return (
      <span className="status-badge status-digital" style={{cursor: 'pointer'}} onClick={onAbrirComprovante}>
        ✔ Assinado Digitalmente (Abrir Comprovante)
      </span>
    );
  }
  if (eq.statusAssinatura === 'Anexado Fisicamente') {
    return (
      <a href={`${API}${eq.caminhoArquivo}`} target="_blank" rel="noreferrer" style={{textDecoration: 'none'}}>
        <span className="status-badge status-fisico" style={{cursor: 'pointer'}}>
          📎 Anexado Fisicamente (Abrir)
        </span>
      </a>
    );
  }
  return <span className="status-badge status-pendente">⏳ Pendente</span>;
}


// ── BACKGROUNDS ───────────────────────────────────────────────────────────

// Dark mode: slime com blobs flutuantes
function SlimeBackground({ subtle = false }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const blobs = subtle ? [
      { x:0.1,  y:0.15, vx:0.0002, vy:0.0001, r:0.6,  color:[13,32,69],    a:0.4 },
      { x:0.85, y:0.8,  vx:-0.0002,vy:-0.0002,r:0.55, color:[26,82,204],   a:0.3 },
      { x:0.5,  y:0.5,  vx:0.0001, vy:0.0003, r:0.5,  color:[192,17,42],   a:0.2 },
      { x:0.2,  y:0.85, vx:0.0003, vy:-0.0001,r:0.45, color:[10,25,60],    a:0.35 },
      { x:0.8,  y:0.2,  vx:-0.0002,vy:0.0002, r:0.4,  color:[59,112,232],  a:0.25 },
    ] : [
      { x:0.15, y:0.2,  vx:0.0003, vy:0.0002, r:0.65, color:[13,32,69],    a:0.6 },
      { x:0.8,  y:0.75, vx:-0.0002,vy:-0.0003,r:0.6,  color:[26,82,204],   a:0.55 },
      { x:0.5,  y:0.5,  vx:0.0002, vy:0.0004, r:0.5,  color:[192,17,42],   a:0.4 },
      { x:0.3,  y:0.8,  vx:0.0004, vy:-0.0002,r:0.45, color:[10,25,60],    a:0.5 },
      { x:0.75, y:0.2,  vx:-0.0003,vy:0.0003, r:0.42, color:[59,112,232],  a:0.45 },
    ];
    let t = 0;
    const draw = () => {
      t++;
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0,0,w,h);
      ctx.fillStyle = '#050a14';
      ctx.fillRect(0,0,w,h);
      blobs.forEach((b,i) => {
        b.x += Math.sin(t*0.008+i*1.3)*0.0015;
        b.y += Math.cos(t*0.008+i*1.7)*0.0015;
        b.x = Math.max(0,Math.min(1,b.x));
        b.y = Math.max(0,Math.min(1,b.y));
        const px=b.x*w, py=b.y*h, sz=Math.min(w,h)*b.r;
        const grad = ctx.createRadialGradient(px,py,0,px,py,sz);
        const [r,g,bl]=b.color;
        grad.addColorStop(0,   `rgba(${r},${g},${bl},${b.a})`);
        grad.addColorStop(0.45,`rgba(${r},${g},${bl},${b.a*0.45})`);
        grad.addColorStop(1,   `rgba(${r},${g},${bl},0)`);
        ctx.globalCompositeOperation='screen';
        ctx.fillStyle=grad;
        ctx.beginPath();
        ctx.arc(px,py,sz,0,Math.PI*2);
        ctx.fill();
      });
      ctx.globalCompositeOperation='source-over';
      animId=requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize',resize); };
  }, []);
  return <canvas ref={canvasRef} className="slime-canvas" />;
}

// Light mode: partículas conectadas em rede
function ParticleBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const COUNT = 60, DIST = 140;
    const particles = Array.from({length: COUNT}, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      r: 1.5 + Math.random() * 2,
      type: Math.random() > 0.6 ? 'red' : 'blue'
    }));
    const draw = () => {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0,0,w,h);
      const bg = ctx.createLinearGradient(0,0,w,h);
      bg.addColorStop(0,'#eef2ff');
      bg.addColorStop(0.5,'#f5f7ff');
      bg.addColorStop(1,'#fdf0f2');
      ctx.fillStyle = bg;
      ctx.fillRect(0,0,w,h);
      for (let i=0; i<particles.length; i++) {
        for (let j=i+1; j<particles.length; j++) {
          const dx=particles[i].x-particles[j].x, dy=particles[i].y-particles[j].y;
          const dist=Math.sqrt(dx*dx+dy*dy);
          if (dist < DIST) {
            const alpha=(1-dist/DIST)*0.3;
            const g=ctx.createLinearGradient(particles[i].x,particles[i].y,particles[j].x,particles[j].y);
            g.addColorStop(0, particles[i].type==='red' ? `rgba(192,17,42,${alpha})` : `rgba(19,64,160,${alpha})`);
            g.addColorStop(1, particles[j].type==='red' ? `rgba(192,17,42,${alpha})` : `rgba(19,64,160,${alpha})`);
            ctx.beginPath(); ctx.moveTo(particles[i].x,particles[i].y); ctx.lineTo(particles[j].x,particles[j].y);
            ctx.strokeStyle=g; ctx.lineWidth=0.8; ctx.stroke();
          }
        }
      }
      particles.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r+3,0,Math.PI*2);
        ctx.fillStyle = p.type==='red' ? 'rgba(192,17,42,0.08)' : 'rgba(19,64,160,0.08)';
        ctx.fill();
        ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle = p.type==='red' ? 'rgba(192,17,42,0.55)' : 'rgba(19,64,160,0.55)';
        ctx.fill();
        p.x+=p.vx; p.y+=p.vy;
        if(p.x<0||p.x>w) p.vx*=-1;
        if(p.y<0||p.y>h) p.vy*=-1;
      });
      animId=requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize',resize); };
  }, []);
  return <canvas ref={canvasRef} className="slime-canvas" />;
}

// Light mode: ondas geométricas animadas
function WaveBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId, t = 0;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    const waves = [
      {amp:38,freq:0.008,speed:0.012,y:0.20,color:'rgba(19,64,160,0.07)',lw:2},
      {amp:28,freq:0.010,speed:0.018,y:0.33,color:'rgba(192,17,42,0.06)',lw:1.5},
      {amp:45,freq:0.006,speed:0.009,y:0.46,color:'rgba(19,64,160,0.09)',lw:2.5},
      {amp:22,freq:0.012,speed:0.022,y:0.57,color:'rgba(192,17,42,0.05)',lw:1.5},
      {amp:50,freq:0.005,speed:0.007,y:0.68,color:'rgba(59,112,232,0.07)',lw:3},
      {amp:30,freq:0.009,speed:0.015,y:0.80,color:'rgba(192,17,42,0.07)',lw:2},
      {amp:20,freq:0.011,speed:0.020,y:0.90,color:'rgba(19,64,160,0.05)',lw:1.5},
    ];
    const draw = () => {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0,0,w,h);
      const bg = ctx.createLinearGradient(0,0,w,h);
      bg.addColorStop(0,'#f0f4ff');
      bg.addColorStop(1,'#fff0f2');
      ctx.fillStyle = bg;
      ctx.fillRect(0,0,w,h);
      waves.forEach(wv => {
        ctx.beginPath();
        for (let x=0; x<=w; x+=2) {
          const y = wv.y*h + Math.sin(x*wv.freq + t*wv.speed)*wv.amp + Math.sin(x*wv.freq*0.5 + t*wv.speed*1.3)*wv.amp*0.4;
          x===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
        }
        ctx.strokeStyle = wv.color;
        ctx.lineWidth = wv.lw;
        ctx.stroke();
      });
      t++;
      animId = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={canvasRef} className="slime-canvas" />;
}
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [usuarioLogado, setUsuarioLogado] = useState(() => {
    const s = localStorage.getItem('magius_ti_usuario');
    return s ? JSON.parse(s) : null;
  });
  const [introVisto, setIntroVisto] = useState(() => sessionStorage.getItem('mk_intro') === '1');
  useEffect(() => {
    if (!introVisto) {
      const t = setTimeout(() => {
        sessionStorage.setItem('mk_intro', '1');
        setIntroVisto(true);
      }, 4500);
      return () => clearTimeout(t);
    }
  }, []);
  const [abaAtiva, setAbaAtiva] = useState(() => {
    const s = localStorage.getItem('magius_ti_usuario');
    if (s) { const u = JSON.parse(s); return u.funcao === 'SESMT' ? 'inventario' : 'termo'; }
    return 'termo';
  });

  // ===== TEMA (light / dark) =====
  // Prioriza preferência salva do usuário logado; senão usa localStorage; default = light
  const [tema, setTema] = useState(() => {
    try {
      const userStr = localStorage.getItem('magius_ti_usuario');
      if (userStr) {
        const u = JSON.parse(userStr);
        if (u.temaPreferido === 'dark' || u.temaPreferido === 'light') return u.temaPreferido;
      }
      const t = localStorage.getItem('magius_ti_tema');
      if (t === 'dark' || t === 'light') return t;
    } catch (e) {}
    return 'light';
  });

  // Aplica/remove a classe no <body> sempre que o tema mudar
  useEffect(() => {
    if (tema === 'dark') document.body.classList.add('theme-dark');
    else document.body.classList.remove('theme-dark');
    localStorage.setItem('magius_ti_tema', tema);
  }, [tema]);

  // Função de toggle — alterna tema, salva localStorage e (se logado) persiste no banco
  const toggleTema = () => {
    const novoTema = tema === 'dark' ? 'light' : 'dark';
    setTema(novoTema);
    if (usuarioLogado?.id) {
      axios.put(`${API}/usuarios/${usuarioLogado.id}/tema`, { tema: novoTema })
        .then(() => {
          // atualiza o usuário em memória e localStorage pra refletir a preferência
          const atualizado = { ...usuarioLogado, temaPreferido: novoTema };
          setUsuarioLogado(atualizado);
          localStorage.setItem('magius_ti_usuario', JSON.stringify(atualizado));
        })
        .catch(err => console.warn('Não foi possível salvar tema no banco:', err.message));
    }
  };

  const path = window.location.pathname;
  // Suporta /magius-keeper/assinar/:token (com base path) e /assinar/:token (sem)
  const isTelaAssinatura = path.includes('/assinar/');
  const tokenUrl = isTelaAssinatura ? path.split('/assinar/')[1] : null;

  const [dadosTermo, setDadosTermo] = useState(null);
  const [erroTermo, setErroTermo] = useState('');
  const [assinadoSucesso, setAssinadoSucesso] = useState(false);
  const [modalExclusaoAberto, setModalExclusaoAberto] = useState(false);
  const [motivoExclusao, setMotivoExclusao] = useState('');
  const [modalComprovanteAberto, setModalComprovanteAberto] = useState(false);
  const [modalBaixaAberto, setModalBaixaAberto] = useState(false);
  const [itensBaixaConfig, setItensBaixaConfig] = useState([]);
  const [expandedLogId, setExpandedLogId] = useState(null);
  const [fotoLightbox, setFotoLightbox] = useState(null);

  const [inputUsuario, setInputUsuario] = useState('');
  const [inputSenha, setInputSenha] = useState('');
  const [erroLogin, setErroLogin] = useState('');
  const [colaborador, setColaborador] = useState('');
  const [matricula, setMatricula] = useState('');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [tipoCpfCnpj, setTipoCpfCnpj] = useState('cpf'); // 'cpf' ou 'cnpj'
  const [setor, setSetor] = useState('');
  const [planta, setPlanta] = useState('Magius Matriz');
  const [equipamentos, setEquipamentos] = useState([]);
  const [listaLogs, setListaLogs] = useState([]);
  const [listaUsuarios, setListaUsuarios] = useState([]);
  const [termoBusca, setTermoBusca] = useState('');
  const [termoBuscaLogs, setTermoBuscaLogs] = useState('');
  const [termoBuscaBaixas, setTermoBuscaBaixas] = useState('');
  const [resultadosBusca, setResultadosBusca] = useState([]);
  const [matriculasSelecionadas, setMatriculasSelecionadas] = useState([]);
  const [colaboradorSelecionado, setColaboradorSelecionado] = useState(null);
  const [equipamentosColaborador, setEquipamentosColaborador] = useState([]);
  const [equipamentosSelecionadosParaBaixa, setEquipamentosSelecionadosParaBaixa] = useState([]);
  const [dadosLotePDF, setDadosLotePDF] = useState([]);
  const [novoUserLogin, setNovoUserLogin] = useState('');
  const [novoUserNome, setNovoUserNome] = useState('');
  const [novoUserFuncao, setNovoUserFuncao] = useState('OPERADOR');
  const tiposEquipamento = ["Notebook","Celular","Headset","Desktop","Teclado","Mouse","Monitor","Suporte para notebook","Carregador do notebook","Outros"];

  useEffect(() => {
    if (isTelaAssinatura && tokenUrl) {
      axios.get(`${API}/inventario/termo/${tokenUrl}`)
        .then(res => setDadosTermo(res.data))
        .catch(err => setErroTermo(err.response?.data?.erro || "Erro ao carregar documento."));
    }
  }, [isTelaAssinatura, tokenUrl]);

  const carregarUsuarios = () => axios.get(`${API}/usuarios`).then(res => setListaUsuarios(res.data));
  const carregarLogs = () => axios.get(`${API}/logs`).then(res => setListaLogs(res.data));

  useEffect(() => {
    if (usuarioLogado?.funcao === 'ADMIN') {
      if (abaAtiva === 'logs' || abaAtiva === 'logs-exclusoes') carregarLogs();
      if (abaAtiva === 'usuarios') carregarUsuarios();
    }
  }, [abaAtiva, usuarioLogado]);

  useEffect(() => { if (abaAtiva === 'inventario' && !colaboradorSelecionado) buscarNoInventario(''); }, [abaAtiva, colaboradorSelecionado]);

  useEffect(() => {
    let iv;
    if (abaAtiva === 'inventario' && colaboradorSelecionado) {
      iv = setInterval(() => {
        axios.get(`${API}/inventario/colaborador/${colaboradorSelecionado.matricula}`)
          .then(res => setEquipamentosColaborador(res.data))
          .catch(err => console.error(err.message));
      }, 3000);
    }
    return () => clearInterval(iv);
  }, [abaAtiva, colaboradorSelecionado]);

  const handleLogin = (e) => {
    e.preventDefault();
    axios.post(`${API}/login`, { usuario: inputUsuario, senha: inputSenha })
      .then(res => {
        setUsuarioLogado(res.data.usuario);
        localStorage.setItem('magius_ti_usuario', JSON.stringify(res.data.usuario));
        // Aplica o tema preferido salvo no banco (se existir)
        const temaSalvo = res.data.usuario.temaPreferido;
        if (temaSalvo === 'dark' || temaSalvo === 'light') setTema(temaSalvo);
        setErroLogin('');
        setAbaAtiva(res.data.usuario.funcao === 'SESMT' ? 'inventario' : 'termo');
      })
      .catch(err => setErroLogin(err.response?.data?.erro || 'Erro ao iniciar sessão!'));
  };

  const handleLogout = () => { setUsuarioLogado(null); localStorage.removeItem('magius_ti_usuario'); setInputUsuario(''); setInputSenha(''); setAbaAtiva('termo'); };
  
  // =====================================================================
  // FUNÇÃO ATUALIZADA: Força o download do PDF após a assinatura digital
  // =====================================================================
  const confirmarAssinaturaDigital = () => {
    axios.post(`${API}/inventario/assinar-digital`, { token: tokenUrl })
      .then((res) => {
        if (res.data.pdfUrl) {
          const fileUrl = `${API}${res.data.pdfUrl}`;
          const link = document.createElement('a');
          link.href = fileUrl;
          link.download = `Termo_Assinado_${dadosTermo[0].matricula}.pdf`;
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
        setAssinadoSucesso(true);
      })
      .catch(err => alert("Erro ao assinar: " + err.message));
  };

  const handleCadastrarUsuario = (e) => {
    e.preventDefault();
    axios.post(`${API}/usuarios`, { usuario: novoUserLogin, nome: novoUserNome, funcao: novoUserFuncao })
      .then(() => { axios.post(`${API}/logs`, { usuario: usuarioLogado.nome, acao: `Autorizou acesso: ${novoUserLogin} como ${novoUserFuncao}` }); alert("Utilizador adicionado!"); setNovoUserLogin(''); setNovoUserNome(''); carregarUsuarios(); })
      .catch(err => alert("Erro: " + (err.response?.data?.erro || err.message)));
  };
  const handleAlterarFuncao = (id, login, novaFuncao) => axios.put(`${API}/usuarios/${id}`, { funcao: novaFuncao }).then(() => { axios.post(`${API}/logs`, { usuario: usuarioLogado.nome, acao: `Alterou a função de ${login} para ${novaFuncao}` }); carregarUsuarios(); }).catch(err => alert(err.message));
  const handleExcluirUsuario = (id, login) => {
    if (login === usuarioLogado.usuario) { alert("Não pode excluir a si próprio!"); return; }
    if (window.confirm(`Revogar acesso de ${login}?`)) axios.delete(`${API}/usuarios/${id}`).then(() => { axios.post(`${API}/logs`, { usuario: usuarioLogado.nome, acao: `Revogou acesso de: ${login}` }); carregarUsuarios(); }).catch(err => alert(err.message));
  };
  const adicionarEquipamento = () => setEquipamentos([...equipamentos, { tipo: tiposEquipamento[0], tipoCustomizado: '', quantidade: 1, patrimonio: '', foto: null, fotoPreview: null }]);
  const handleFotoEquipamento = (index, file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => { const n=[...equipamentos]; n[index].foto=file; n[index].fotoPreview=e.target.result; setEquipamentos(n); };
    reader.readAsDataURL(file);
  };
  const removerFotoEquipamento = (index) => { const n=[...equipamentos]; n[index].foto=null; n[index].fotoPreview=null; setEquipamentos(n); };
  const atualizarEquipamento = (i, campo, valor) => { const n = [...equipamentos]; n[i][campo] = valor; setEquipamentos(n); };
  const removerEquipamento = (i) => setEquipamentos(equipamentos.filter((_, idx) => idx !== i));

  // VALIDAÇÃO DO CPF/CNPJ
  const cpfCnpjNumeros = cpfCnpj.replace(/\D/g, '');
  const cpfCnpjValido = validarCpfCnpj(cpfCnpj);
  const cpfCnpjFoiPreenchido = cpfCnpjNumeros.length > 0;
  const isCnpj = tipoCpfCnpj === 'cnpj';

  const formInvalido = !colaborador.trim() || (!isCnpj && !matricula.trim()) || !cpfCnpjValido || !setor.trim() || !planta.trim() || equipamentos.length === 0 || equipamentos.some(eq => (eq.tipo === 'Outros' && (!eq.tipoCustomizado || !eq.tipoCustomizado.trim())) || (!eq.patrimonio || !eq.patrimonio.trim()));
  
  const registrarTermo = () => {
    const resumo = equipamentos.map(eq => `${eq.quantidade}x ${eq.tipo === 'Outros' ? eq.tipoCustomizado : eq.tipo}`).join(', ');
    const dc = { colaborador, matricula, setor, planta };
    const temFotos = equipamentos.some(eq => eq.foto);
    const matriculaFinal = matricula.trim() || (isCnpj ? cpfCnpjNumeros : matricula);
    if (temFotos) {
      const fd = new FormData();
      fd.append('colaborador', colaborador); fd.append('matricula', matriculaFinal); fd.append('cpfCnpj', cpfCnpjNumeros);
      fd.append('setor', setor); fd.append('planta', planta); fd.append('usuarioTI', usuarioLogado.nome);
      fd.append('equipamentos', JSON.stringify(equipamentos.map(eq => ({ tipo: eq.tipo, tipoCustomizado: eq.tipoCustomizado, quantidade: eq.quantidade, patrimonio: eq.patrimonio }))));
      equipamentos.forEach((eq, i) => { if (eq.foto) fd.append(`foto_${i}`, eq.foto); });
      axios.post(`${API}/inventario/com-fotos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })
        .then(() => axios.post(`${API}/logs`, { usuario: usuarioLogado.nome, acao: `Registrou Equipamentos para ${colaborador} (Matrícula: ${matriculaFinal}, ${tipoDocumento(cpfCnpj)}: ${formatarCpfCnpjExibicao(cpfCnpj)}). Itens: ${resumo}` }))
        .then(() => { alert("Sucesso!"); setAbaAtiva('inventario'); verDetalhesColaborador(dc); setColaborador(''); setMatricula(''); setCpfCnpj(''); setTipoCpfCnpj('cpf'); setSetor(''); setEquipamentos([]); })
        .catch(err => alert("⚠️ BLOQUEADO: " + (err.response?.data?.erro || err.message)));
    } else {
      axios.post(`${API}/inventario`, { colaborador, matricula: matriculaFinal, cpfCnpj: cpfCnpjNumeros, setor, planta, equipamentos, usuarioTI: usuarioLogado.nome })
        .then(() => axios.post(`${API}/logs`, { usuario: usuarioLogado.nome, acao: `Registrou Equipamentos para ${colaborador} (Matrícula: ${matriculaFinal}, ${tipoDocumento(cpfCnpj)}: ${formatarCpfCnpjExibicao(cpfCnpj)}). Itens: ${resumo}` }))
        .then(() => { alert("Sucesso!"); setAbaAtiva('inventario'); verDetalhesColaborador(dc); setColaborador(''); setMatricula(''); setCpfCnpj(''); setTipoCpfCnpj('cpf'); setSetor(''); setEquipamentos([]); })
        .catch(err => alert("⚠️ BLOQUEADO: " + (err.response?.data?.erro || err.message)));
    }
  };
  const buscarNoInventario = (termo = termoBusca) => axios.get(`${API}/inventario/pesquisa?busca=${termo}`).then(res => { setResultadosBusca(res.data); setMatriculasSelecionadas([]); }).catch(err => alert(err.message));
  const verDetalhesColaborador = (info) => {
    axios.get(`${API}/inventario/colaborador/${info.matricula}`).then(res => { setEquipamentosColaborador(res.data); setColaboradorSelecionado(info); setEquipamentosSelecionadosParaBaixa([]); }).catch(err => alert(err.message));
  };
  const handleSelecionarUmEq = (id) => setEquipamentosSelecionadosParaBaixa(prev => prev.includes(id) ? prev.filter(e => e !== id) : [...prev, id]);
  const handleSelecionarTodosEq = () => setEquipamentosSelecionadosParaBaixa(prev => prev.length === equipamentosColaborador.length ? [] : equipamentosColaborador.map(e => e.id));
  
  const handleAbrirModalBaixa = () => {
    if (!equipamentosSelecionadosParaBaixa.length) return;
    setItensBaixaConfig(equipamentosColaborador.filter(eq => equipamentosSelecionadosParaBaixa.includes(eq.id)).map(eq => ({ ...eq, qtdDevolvida: eq.quantidade })));
    setModalBaixaAberto(true);
  };

  // =====================================================================
  // FUNÇÃO ATUALIZADA: Força o download do PDF ao realizar a Baixa
  // =====================================================================
  const confirmarBaixaParcial = () => {
    const payload = itensBaixaConfig.map(item => ({ id: item.id, devolvido: parseInt(item.qtdDevolvida), quantidadeOriginal: item.quantidade, colaborador: item.colaborador, matricula: item.matricula, cpfCnpj: item.cpfCnpj, tipo: item.tipo, patrimonio: item.patrimonio || 'N/A' }));
    
    axios.post(`${API}/inventario/devolucao`, { itens: payload, usuarioAcao: usuarioLogado.nome })
      .then((res) => { 
        alert("Baixa realizada com sucesso! O comprovante será baixado.");
        
        if (res.data.pdfUrl) {
          const fileUrl = `${API}${res.data.pdfUrl}`;
          const link = document.createElement('a');
          link.href = fileUrl;
          link.download = `Comprovante_Devolucao_${payload[0].matricula}.pdf`;
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }

        setModalBaixaAberto(false); 
        setEquipamentosSelecionadosParaBaixa([]); 
        buscarNoInventario(''); 
        
        if (equipamentosSelecionadosParaBaixa.length === equipamentosColaborador.length && payload.every(p => p.devolvido === p.quantidadeOriginal)) { 
          setColaboradorSelecionado(null); 
        } else { 
          verDetalhesColaborador(colaboradorSelecionado); 
        } 
      })
      .catch(err => alert("Erro: " + (err.response?.data?.erro || err.message)));
  };

  const handleSelecionarUm = (mat) => setMatriculasSelecionadas(prev => prev.includes(mat) ? prev.filter(m => m !== mat) : [...prev, mat]);
  const handleSelecionarTodos = () => setMatriculasSelecionadas(prev => prev.length === resultadosBusca.length ? [] : resultadosBusca.map(c => c.matricula));
  
  const confirmarExclusao = () => {
    if (motivoExclusao.trim().length < 5) { alert("Digite um motivo válido."); return; }
    if (window.confirm(`Excluir ${matriculasSelecionadas.length} registro(s)? Ação irreversível.`)) {
      axios.post(`${API}/inventario/excluir-registros`, { matriculas: matriculasSelecionadas, motivo: motivoExclusao, usuarioAcao: usuarioLogado.nome })
        .then(() => { alert("Excluído!"); setModalExclusaoAberto(false); setMatriculasSelecionadas([]); buscarNoInventario(''); })
        .catch(err => alert("Erro: " + (err.response?.data?.erro || err.message)));
    }
  };

  const exportarCSV = () => {
    if (!matriculasSelecionadas.length) { alert("Selecione pelo menos um!"); return; }
    axios.post(`${API}/inventario/lote`, { matriculas: matriculasSelecionadas }).then(res => {
      let csv = "\uFEFFColaborador;Matrícula;CPF/CNPJ;Setor;Planta;Equipamento;Património;Quantidade;Data de Entrega;Responsável TI\n";
      res.data.forEach(item => { const d = new Date(item.dataEntrega).toLocaleDateString('pt-BR'); csv += `"${item.colaborador}";"${item.matricula}";"${formatarCpfCnpjExibicao(item.cpfCnpj) || ''}";"${item.setor}";"${item.planta}";"${item.tipo}";"${item.patrimonio}";${item.quantidade};"${d}";"${item.usuarioTI}"\n`; });
      const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' })); link.download = `Inventario_TI_Magius_${new Date().toLocaleDateString('pt-BR').replace(/\//g,'_')}.csv`; link.click();
    }).catch(err => alert(err.message));
  };

  const exportarPDFLote = () => {
    if (!matriculasSelecionadas.length) { alert("Selecione pelo menos um!"); return; }
    axios.post(`${API}/inventario/lote`, { matriculas: matriculasSelecionadas }).then(res => {
      setDadosLotePDF(res.data);
      setTimeout(() => {
        const el = document.getElementById('inventario-lote-pdf'); el.style.display = 'block';
        html2canvas(el, { scale: 2 }).then(canvas => {
          const pdf = new jsPDF('p','mm','a4'); pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,pdf.internal.pageSize.getWidth(),(canvas.height*pdf.internal.pageSize.getWidth())/canvas.width); pdf.save('Relatorio_Inventario_TI_Magius.pdf'); el.style.display = 'none'; setDadosLotePDF([]);
        });
      }, 300);
    }).catch(err => alert(err.message));
  };

  const gerarLinkEmail = (mat) => {
    const emailDestino = window.prompt(`Digite o e-mail corporativo do colaborador para enviar o link da matrícula ${mat}:`);
    if (!emailDestino || !emailDestino.trim()) return;
    axios.post(`${API}/inventario/gerar-link`, { matricula: mat, email: emailDestino.trim() })
      .then(() => alert("✅ E-mail enviado com sucesso!"))
      .catch(err => alert("Erro ao enviar link: " + (err.response?.data?.erro || err.message)));
  };

  const fazerUploadFisico = (e, mat) => { const file = e.target.files[0]; if (!file) return; const fd = new FormData(); fd.append('arquivoPdf', file); fd.append('matricula', mat); axios.post(`${API}/inventario/anexar-termo`, fd).then(() => { alert("Termo físico anexado!"); verDetalhesColaborador(colaboradorSelecionado); }).catch(err => alert(err.message)); };
  
  const imprimirComprovante = () => { const el = document.getElementById('comprovante-print-area'); html2canvas(el, { scale: 2 }).then(canvas => { const pdf = new jsPDF('p','mm','a4'); pdf.addImage(canvas.toDataURL('image/png'),'PNG',0,0,pdf.internal.pageSize.getWidth(),(canvas.height*pdf.internal.pageSize.getWidth())/canvas.width); pdf.save(`Comprovante_Assinatura_${colaboradorSelecionado.matricula}.pdf`); }); };
  
  const temPendente = equipamentosColaborador.some(eq => eq.statusAssinatura === 'Pendente');
  const logsFiltrados = listaLogs.filter(l => l.usuario.toLowerCase().includes(termoBuscaLogs.toLowerCase()) || l.acao.toLowerCase().includes(termoBuscaLogs.toLowerCase()));
  const logsBaixas = listaLogs.filter(l => l.acao.includes('Deu baixa') || l.acao.includes('Excluiu o registro')).filter(l => l.usuario.toLowerCase().includes(termoBuscaBaixas.toLowerCase()) || l.acao.toLowerCase().includes(termoBuscaBaixas.toLowerCase()));

  /* ── TELA ASSINATURA DO COLABORADOR ── */
  if (isTelaAssinatura) {
    if (erroTermo) return <div style={{background:'var(--gray-50)'}}><style>{styles}</style><div className="sign-result"><div className="sign-result-card sign-result-error"><div className="sign-result-icon">⚠️</div><div className="sign-result-title">{erroTermo}</div><div className="sign-result-sub">Verifique o link.</div></div></div></div>;
    if (assinadoSucesso) return (
      <div style={{background:'var(--gray-50)'}}>
        <style>{styles}</style>
        <div className="sign-result">
          <div className="sign-result-card sign-result-success">
            <div className="sign-result-icon">✅</div>
            <div className="sign-result-title">Termo assinado com sucesso!</div>
            <div className="sign-result-sub">Sua assinatura foi registrada e um PDF de comprovação foi baixado no seu dispositivo.<br/><br/>Pode fechar esta página.</div>
          </div>
        </div>
      </div>
    );
    if (!dadosTermo) return <div style={{background:'var(--gray-50)'}}><style>{styles}</style><div className="loading-center"><div className="spinner"/><span>Carregando documento...</span></div></div>;
    const colab = dadosTermo[0];
    const dataAtual = new Date();
    const dia = String(dataAtual.getDate()).padStart(2,'0');
    const meses = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
    const tipoDocColab = tipoDocumento(colab.cpfCnpj);
    const cpfCnpjColabFormatado = formatarCpfCnpjExibicao(colab.cpfCnpj);
    return (
      <div className="sign-page"><style>{styles}</style>
        <div className="sign-card">
          <div className="sign-header">
            <img src={LOGO_URL} alt="Magius" className="sign-header-logo" style={{height:'36px', width:'auto', display:'block', objectFit:'contain', flexShrink:0}}/>
            <div className="sign-header-divider"/>
            <div style={{flex:1}}><div className="sign-header-title">Magius Metalúrgica Industrial Ltda.</div><div className="sign-header-sub">Autorização de Acesso Remoto / Uso de Equipamentos</div></div>
            <button
              onClick={toggleTema}
              title={tema === 'dark' ? 'Tema claro' : 'Tema escuro'}
              aria-label="Alternar tema"
              style={{background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', color:'#fff', width:'38px', height:'38px', borderRadius:'8px', cursor:'pointer', fontSize:'16px', flexShrink:0}}
            >
              {tema === 'dark' ? '☀️' : '🌙'}
            </button>
          </div>
          <div className="sign-body">
            <p className="sign-doc-text"><strong>( X )</strong> Eu <strong>{colab.colaborador}</strong>, Matrícula <strong>{colab.matricula}</strong>, {tipoDocColab} <strong>{cpfCnpjColabFormatado}</strong>, colaborador da empresa Magius Metalúrgica Industrial Ltda.,</p>
            <p className="sign-doc-text"><strong>Declaro para os devidos fins de direito que:</strong></p>
            <p className="sign-doc-text"><strong>( X )</strong> Estou ciente de que o(s) equipamento(s) descrito(s) abaixo foi cedido para utilização nas dependências da empresa ou residência, exclusivamente para execução das atividades profissionais.</p>

            <div className="sign-section-title">Dados do Responsável</div>
            <table className="sign-table">
              <tbody>
                <tr><td style={{width:'180px', background:'var(--gray-50)', fontWeight:600}}>Nome</td><td>{colab.colaborador}</td></tr>
                <tr><td style={{background:'var(--gray-50)', fontWeight:600}}>Matrícula</td><td>{colab.matricula}</td></tr>
                <tr><td style={{background:'var(--gray-50)', fontWeight:600}}>{tipoDocColab}</td><td><strong>{cpfCnpjColabFormatado}</strong></td></tr>
                <tr><td style={{background:'var(--gray-50)', fontWeight:600}}>Setor / Planta</td><td>{colab.setor} — {colab.planta}</td></tr>
              </tbody>
            </table>

            <div className="sign-section-title">Equipamentos Recebidos</div>
            <table className="sign-table">
              <thead><tr><th className="center" style={{width:'60px'}}>Qtd</th><th>Equipamento</th><th>Patrimônio / Série</th></tr></thead>
              <tbody>{dadosTermo.map((item, i) => <tr key={i}><td className="center"><strong>{item.quantidade}</strong></td><td>{item.tipo}</td><td>{item.patrimonio || 'N/A'}</td></tr>)}</tbody>
            </table>
            <div className="sign-section-title">Cláusula – Uso Exclusivo dos Equipamentos</div>
            <p className="sign-doc-text">Declaro estar ciente de que os equipamentos disponibilizados destinam-se exclusivamente ao desempenho das atividades profissionais, sendo expressamente proibida sua utilização para fins particulares ou compartilhamento com terceiros.</p>
            <div className="sign-section-title">Cláusula – Responsabilidade por Danos</div>
            {tipoDocColab === 'CNPJ' ? (
              <p className="sign-doc-text">Declaro estar ciente de que eventuais danos causados aos equipamentos, quando decorrentes de dolo, mau uso ou negligência, poderão ser objeto de ressarcimento à empresa.</p>
            ) : (
              <p className="sign-doc-text">Declaro estar ciente de que eventuais danos causados aos equipamentos, quando decorrentes de dolo, mau uso ou negligência, poderão ser objeto de ressarcimento à empresa, nos termos do artigo 462 da CLT.</p>
            )}
            <div className="sign-section-title">Cláusula – Devolução e Comunicação de Ocorrências</div>
            <p className="sign-doc-text">Comprometo-me a comunicar imediatamente à empresa qualquer ocorrência relacionada aos equipamentos e a devolvê-los sempre que solicitado ou em caso de encerramento do vínculo contratual.</p>
            <p className="sign-doc-text" style={{marginTop:'20px'}}>Sendo esta a expressão da verdade, firmo o presente documento.</p>
            <p style={{textAlign:'right', marginTop:'30px', fontWeight:'600', color:'var(--gray-700)', fontSize:'14px'}}>São José dos Pinhais, {dia} de {meses[dataAtual.getMonth()]} de {dataAtual.getFullYear()}.</p>
            <button className="sign-confirm-btn" onClick={confirmarAssinaturaDigital}>✅ &nbsp; Li e Aceito — Assinar Termo Digitalmente</button>
            <p className="sign-confirm-note">Ao clicar, seu endereço de IP e a data/hora serão registrados, e um PDF de comprovação será baixado na sua máquina.</p>
          </div>
        </div>
      </div>
    );
  }

  /* ── TELA LOGIN ── */
  if (!usuarioLogado) {
    const loginForm = (
      <div className="login-wrap"><style>{styles}</style>
        <WaveBackground />
        <div className="login-card">
          <div className="login-logo-area">
            <img src={LOGO_URL} alt="Magius" className="login-logo-img"/>
            <div className="login-subtitle">Equipment management system</div>
          </div>
          <form onSubmit={handleLogin}>
            <label className="login-label">Usuário</label>
            <input className="login-input" type="text" value={inputUsuario} onChange={e => setInputUsuario(e.target.value)} required placeholder="Ex: ****.****" autoComplete="username"/>
            <label className="login-label">Senha</label>
            <input className="login-input" type="password" value={inputSenha} onChange={e => setInputSenha(e.target.value)} required placeholder="••••••••" autoComplete="current-password"/>
            {erroLogin && <div className="login-error">⚠️ {erroLogin}</div>}
            <button className="login-btn" type="submit">Entrar no Sistema</button>
          </form>
        </div>
      </div>
    );

    if (introVisto) return loginForm;

    return (
      <div style={{position:'fixed', inset:0, background:'#000', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:'18px', overflow:'hidden'}}>
        <style>{`
          @keyframes mkRevealUp { to { opacity:1; transform:translateY(0); filter:blur(0); } }
          @keyframes mkExpandLine { to { width:340px; } }
          @keyframes mkFadeInSub { to { color:rgba(255,255,255,0.4); } }
          @keyframes mkFadeOut { to { opacity:0; transform:scale(1.03); } }
          @keyframes mkLoginSurge { to { opacity:1; } }
          @keyframes mkBlink { 0%,100%{opacity:1} 50%{opacity:0} }
          .mk-magius { font-family:'Segoe UI',Arial,sans-serif; font-size:clamp(32px,6vw,52px); font-weight:800; letter-spacing:4px; background:linear-gradient(135deg,#ffffff,#93b4ff); -webkit-background-clip:text; -webkit-text-fill-color:transparent; opacity:0; transform:translateY(20px); filter:blur(10px); animation:mkRevealUp 0.8s cubic-bezier(0.4,0,0.2,1) 0.4s forwards; }
          .mk-keeper { font-family:'Segoe UI',Arial,sans-serif; font-size:clamp(32px,6vw,52px); font-weight:800; letter-spacing:4px; background:linear-gradient(135deg,#e01530,#ff6b7a); -webkit-background-clip:text; -webkit-text-fill-color:transparent; opacity:0; transform:translateY(20px); filter:blur(10px); animation:mkRevealUp 0.8s cubic-bezier(0.4,0,0.2,1) 1.0s forwards; }
          .mk-cursor { display:inline-block; width:3px; height:clamp(34px,5vw,52px); background:#3b70e8; border-radius:2px; opacity:0; animation:mkBlink 0.7s step-end 0.3s infinite; vertical-align:middle; margin-left:4px; box-shadow:0 0 12px rgba(59,112,232,0.9); }
          .mk-line { height:1px; width:0; background:linear-gradient(90deg,transparent,rgba(59,112,232,0.7),rgba(224,21,48,0.5),transparent); animation:mkExpandLine 0.8s ease 1.8s forwards; }
          .mk-sub { font-family:'Segoe UI',Arial,sans-serif; font-size:11px; font-weight:300; color:rgba(255,255,255,0); letter-spacing:6px; text-transform:uppercase; animation:mkFadeInSub 0.8s ease 2.3s forwards; }
          .mk-intro { animation:mkFadeOut 0.9s ease 3.4s forwards; display:flex; flex-direction:column; align-items:center; gap:16px; }
        `}</style>
        <div className="mk-intro" >
          <div style={{display:'flex', alignItems:'baseline', gap:'16px'}}>
            <span className="mk-magius">MAGIUS</span>
            <span className="mk-keeper">KEEPER</span>
            <span className="mk-cursor" id="mk-cur"></span>
          </div>
          <div className="mk-line"></div>
          <div className="mk-sub">Gestão de Equipamentos de TI</div>
        </div>

      </div>
    );
  }

  /* ── TELA PRINCIPAL ── */
  return (
    <div className="page-bg"><style>{styles}</style>
      {tema === 'dark' ? <SlimeBackground subtle={true} /> : <WaveBackground />}
      {tema === 'dark' && <div className="slime-grid" />}



      {/* MODAL COMPROVANTE */}
      {modalComprovanteAberto && colaboradorSelecionado && equipamentosColaborador.length > 0 && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="modal-close-btn" onClick={() => setModalComprovanteAberto(false)}>✕</button>
            <div id="comprovante-print-area">
              <div className="sign-header" style={{borderRadius:'var(--radius-lg)', marginBottom:'20px'}}>
                <img src={LOGO_URL} alt="Magius" className="sign-header-logo"/>
                <div className="sign-header-divider"/>
                <div><div className="sign-header-title">Magius Metalúrgica Industrial Ltda.</div><div className="sign-header-sub">Comprovante de Aceite - Acesso Remoto / Equipamentos</div></div>
              </div>
              <div style={{padding:'0 10px'}}>
                <p className="sign-doc-text"><strong>Colaborador:</strong> {colaboradorSelecionado.colaborador}</p>
                <p className="sign-doc-text"><strong>Matrícula:</strong> {colaboradorSelecionado.matricula}</p>
                {equipamentosColaborador[0].cpfCnpj && <p className="sign-doc-text"><strong>{tipoDocumento(equipamentosColaborador[0].cpfCnpj)}:</strong> {formatarCpfCnpjExibicao(equipamentosColaborador[0].cpfCnpj)}</p>}
                <p className="sign-doc-text"><strong>Setor / Planta:</strong> {colaboradorSelecionado.setor} - {colaboradorSelecionado.planta}</p>
                <table className="sign-table" style={{marginTop:'20px'}}>
                  <thead><tr><th className="center" style={{width:'60px'}}>Qtd</th><th>Equipamento</th><th>Patrimônio / Série</th></tr></thead>
                  <tbody>{equipamentosColaborador.map(item => <tr key={item.id}><td className="center"><strong>{item.quantidade}</strong></td><td>{item.tipo}</td><td>{item.patrimonio || 'N/A'}</td></tr>)}</tbody>
                </table>
                <div className="assinatura-box">
                  <strong>✅ ACEITE REGISTRADO ELETRONICAMENTE</strong>
                  <span><strong>Assinado por:</strong> {colaboradorSelecionado.colaborador}</span>
                  <span><strong>Data e Hora:</strong> {new Date(equipamentosColaborador[0].dataAssinatura).toLocaleString('pt-BR')}</span>
                  <span><strong>IP:</strong> {equipamentosColaborador[0].ipAssinatura}</span>
                </div>
              </div>
            </div>
            <button className="btn btn-primary btn-full" style={{marginTop:'24px'}} onClick={imprimirComprovante}>📄 Salvar Comprovante em PDF</button>
          </div>
        </div>
      )}

      {/* MODAL BAIXA */}
      {modalBaixaAberto && (
        <div className="modal-overlay">
          <div className="modal-content" style={{maxWidth:'650px'}}>
            <button className="modal-close-btn" onClick={() => setModalBaixaAberto(false)}>✕</button>
            <div className="card-title">📦 Confirmar Devolução / Baixa</div>
            <p style={{fontSize:'14px', color:'var(--gray-500)', marginBottom:'20px'}}>Indique a quantidade exata que está sendo devolvida:</p>
            <div className="table-wrap" style={{marginBottom:'24px'}}>
              <table className="data-table">
                <thead><tr><th>Equipamento</th><th>Patrimônio</th><th className="center" style={{width:'150px'}}>Qtd Devolvida</th></tr></thead>
                <tbody>
                  {itensBaixaConfig.map((item, index) => (
                    <tr key={item.id}>
                      <td className="bold">{item.tipo}</td>
                      <td className="mono">{item.patrimonio || 'N/A'}</td>
                      <td className="center">
                        <div style={{display:'flex', alignItems:'center', gap:'8px', justifyContent:'center'}}>
                          <input type="number" min="1" max={item.quantidade} className="form-input" style={{width:'70px', padding:'6px', textAlign:'center'}} value={item.qtdDevolvida}
                            onChange={e => { let v = parseInt(e.target.value)||1; if(v>item.quantidade)v=item.quantidade; const n=[...itensBaixaConfig]; n[index].qtdDevolvida=v; setItensBaixaConfig(n); }}/>
                          <span style={{fontSize:'12px', color:'var(--gray-500)'}}>de {item.quantidade}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{display:'flex', gap:'10px'}}>
              <button className="btn btn-danger" style={{flex:1, justifyContent:'center'}} onClick={confirmarBaixaParcial}>Confirmar Baixa</button>
              <button className="btn btn-ghost" onClick={() => setModalBaixaAberto(false)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <div className="app-shell">
        {/* TOPBAR */}
        <div className="topbar">
          <div className="topbar-brand">
            <img src={LOGO_URL} alt="Magius" className="topbar-logo-img"/>
            <div className="topbar-divider"/>
            <span className="topbar-user">
              Sessão: <strong>{usuarioLogado.nome}</strong>
              <span className={`topbar-badge ${usuarioLogado.funcao==='ADMIN'?'admin':usuarioLogado.funcao==='SESMT'?'sesmt':''}`}>{usuarioLogado.funcao}</span>
            </span>
          </div>
          <div className="topbar-actions">
            <div
              className="theme-toggle-wrap"
              onClick={toggleTema}
              title={tema === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
              aria-label="Alternar tema"
              role="button"
            >
              <div className={`theme-toggle-track ${tema}`}>
                {tema === 'light' ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3b70e8" strokeWidth="2.5" strokeLinecap="round">
                    <circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>
                    <line x1="4.2" y1="4.2" x2="6.3" y2="6.3"/><line x1="17.7" y1="17.7" x2="19.8" y2="19.8"/>
                    <line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
                    <line x1="4.2" y1="19.8" x2="6.3" y2="17.7"/><line x1="17.7" y1="6.3" x2="19.8" y2="4.2"/>
                  </svg>
                ) : (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#93b4ff" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>
                  </svg>
                )}
              </div>
              <div className={`theme-toggle-thumb ${tema}`}/>
            </div>
            <button className="btn-logout" onClick={handleLogout}>Sair →</button>
          </div>
        </div>

        {/* NAV */}
        <div className="nav-tabs">
          {usuarioLogado.funcao !== 'SESMT' && <button className={`nav-tab ${abaAtiva==='termo'?'active':''}`} onClick={()=>setAbaAtiva('termo')}><span>📝</span> Gerar Termo</button>}
          <button className={`nav-tab ${abaAtiva==='inventario'?'active':''}`} onClick={()=>setAbaAtiva('inventario')}><span>📦</span> Inventário</button>
          {usuarioLogado.funcao === 'ADMIN' && <>
            <button className={`nav-tab ${abaAtiva==='logs'?'active':''}`} onClick={()=>setAbaAtiva('logs')}><span>🔒</span> Todos os Logs</button>
            <button className={`nav-tab ${abaAtiva==='logs-exclusoes'?'active':''}`} onClick={()=>setAbaAtiva('logs-exclusoes')}><span>📉</span> Baixas e Exclusões</button>
            <button className={`nav-tab ${abaAtiva==='usuarios'?'active':''}`} onClick={()=>setAbaAtiva('usuarios')}><span>👥</span> Utilizadores</button>
          </>}
        </div>

        {/* ABA TERMO */}
        {abaAtiva==='termo' && usuarioLogado.funcao!=='SESMT' && (
          <div className="card">
            <div className="card-title">📝 Novo Registro de Equipamentos</div>
            <div className="form-row">
              <div className="form-group flex-2"><label className="form-label">Nome do Colaborador / Empresa</label><input className="form-input" type="text" value={colaborador} onChange={e=>setColaborador(e.target.value)} placeholder="Ex: João da Silva ou Empresa Ltda."/></div>
              <div className="form-group flex-1"><label className="form-label">Planta</label><select className="form-select" value={planta} onChange={e=>setPlanta(e.target.value)}><option value="Magius Matriz">Magius Matriz</option><option value="Magius Av. Rui Barbosa">Magius Av. Rui Barbosa</option><option value="MGpress">MGpress</option></select></div>
            </div>
            <div className="form-row">
              <div className="form-group flex-2">
                <label className="form-label">Tipo de Documento *</label>
                <div style={{display:'flex', gap:'8px'}}>
                  <button type="button"
                    onClick={()=>{ setTipoCpfCnpj('cpf'); setCpfCnpj(''); setMatricula(''); }}
                    style={{flex:1, padding:'11px', borderRadius:'var(--radius)', border: tipoCpfCnpj==='cpf' ? '2px solid var(--blue-400)' : '1.5px solid var(--border-default)', background: tipoCpfCnpj==='cpf' ? 'var(--blue-50)' : 'var(--bg-input)', color: tipoCpfCnpj==='cpf' ? 'var(--blue-600)' : 'var(--text-muted)', fontFamily:"'Segoe UI', Arial, sans-serif", fontSize:'13.5px', fontWeight: tipoCpfCnpj==='cpf' ? 700 : 400, cursor:'pointer', transition:'all 0.2s'}}>
                    👤 CPF — Colaborador
                  </button>
                  <button type="button"
                    onClick={()=>{ setTipoCpfCnpj('cnpj'); setCpfCnpj(''); setMatricula(''); }}
                    style={{flex:1, padding:'11px', borderRadius:'var(--radius)', border: tipoCpfCnpj==='cnpj' ? '2px solid var(--blue-400)' : '1.5px solid var(--border-default)', background: tipoCpfCnpj==='cnpj' ? 'var(--blue-50)' : 'var(--bg-input)', color: tipoCpfCnpj==='cnpj' ? 'var(--blue-600)' : 'var(--text-muted)', fontFamily:"'Segoe UI', Arial, sans-serif", fontSize:'13.5px', fontWeight: tipoCpfCnpj==='cnpj' ? 700 : 400, cursor:'pointer', transition:'all 0.2s'}}>
                    🏢 CNPJ — Empresa
                  </button>
                </div>
              </div>
              <div className="form-group flex-1">
                <label className="form-label">{isCnpj ? 'CNPJ *' : 'CPF *'}</label>
                <input
                  className={`form-input ${cpfCnpjFoiPreenchido && !cpfCnpjValido ? 'invalid' : ''} ${cpfCnpjValido ? 'valid' : ''}`}
                  type="text"
                  value={cpfCnpj}
                  onChange={e => setCpfCnpj(aplicarMascaraCpfCnpj(e.target.value))}
                  placeholder={isCnpj ? '00.000.000/0000-00' : '000.000.000-00'}
                  maxLength={18}
                  inputMode="numeric"
                />
                {cpfCnpjFoiPreenchido && !cpfCnpjValido && (
                  <span className="form-hint error">⚠️ {isCnpj ? 'CNPJ' : 'CPF'} inválido.</span>
                )}
                {cpfCnpjValido && (
                  <span className="form-hint ok">✓ {isCnpj ? 'CNPJ' : 'CPF'} válido</span>
                )}
              </div>
            </div>
            {!isCnpj && (
            <div className="form-row">
              <div className="form-group flex-2"><label className="form-label">Matrícula *</label><input className="form-input" type="text" value={matricula} onChange={e=>setMatricula(e.target.value)} placeholder="Ex: 12345"/></div>
              <div className="form-group flex-1"></div>
            </div>
            )}
            <div className="form-row">
              <div className="form-group flex-2"><label className="form-label">Setor</label><input className="form-input" type="text" value={setor} onChange={e=>setSetor(e.target.value)} placeholder="Ex: Engenharia"/></div>
              <div className="form-group flex-1"></div>
            </div>
            <div className="equip-section">
              <div className="equip-section-title">🖥️ Equipamentos Entregues</div>
              {equipamentos.length === 0 && <div className="empty-state"><div className="empty-state-icon">📭</div><div className="empty-state-text">Nenhum equipamento adicionado</div><div className="empty-state-sub">Clique em "+ Adicionar" para começar</div></div>}
              {equipamentos.map((item, index) => (
                <div key={index} className="equip-row">
                  <select value={item.tipo} onChange={e=>atualizarEquipamento(index,'tipo',e.target.value)} className="form-select" style={{flex:item.tipo==='Outros'?1:2}}>{tiposEquipamento.map(t=><option key={t} value={t}>{t}</option>)}</select>
                  {item.tipo==='Outros' && <input type="text" placeholder="Qual equipamento?" value={item.tipoCustomizado} onChange={e=>atualizarEquipamento(index,'tipoCustomizado',e.target.value)} className="form-input" style={{flex:1, background:'var(--blue-50)'}}/>}
                  <input type="number" min="1" value={item.quantidade} onChange={e=>atualizarEquipamento(index,'quantidade',e.target.value)} className="form-input" style={{flex:'0 0 80px'}}/>
                  <input type="text" placeholder="Patrimônio / Série (ou N/A)" value={item.patrimonio} onChange={e=>atualizarEquipamento(index,'patrimonio',e.target.value)} className="form-input" style={{flex:2}}/>
                  <button className="btn btn-icon-only" onClick={()=>removerEquipamento(index)}>✕</button>
                </div>
              ))}
              <button className="btn btn-success" style={{marginTop:'12px'}} onClick={adicionarEquipamento}>+ Adicionar Equipamento</button>
            </div>
            {formInvalido && <div style={{fontSize:'13px', color:'var(--red-500)', textAlign:'center', marginBottom:'10px', fontWeight:'600'}}>⚠️ Preencha todos os campos obrigatórios (Nome, CPF/CNPJ válido, Setor e Patrimônio/Série). Matrícula obrigatória apenas para CPF.</div>}
            <button className="btn btn-primary btn-full" onClick={registrarTermo} disabled={formInvalido}>Registrar Equipamentos e Enviar Link 🔗</button>
          </div>
        )}

        {/* ABA INVENTÁRIO */}
        {abaAtiva==='inventario' && (
          <div>
            {!colaboradorSelecionado ? (
              <div className="card">
                <div className="card-title">📦 Consulta de Equipamentos</div>
                <div className="search-bar">
                  <div className="search-input-wrap"><span className="search-icon">🔍</span><input className="search-input" type="text" placeholder="Buscar por nome ou matrícula..." value={termoBusca} onChange={e=>setTermoBusca(e.target.value)} onKeyDown={e=>e.key==='Enter'&&buscarNoInventario()}/></div>
                  <button className="btn btn-primary" onClick={()=>buscarNoInventario()}>Pesquisar</button>
                </div>
                {resultadosBusca.length > 0 && (
                  <div>
                    <div className="toolbar">
                      <span className="toolbar-info">Selecionados: <strong>{matriculasSelecionadas.length}</strong> de <strong>{resultadosBusca.length}</strong></span>
                      <div className="toolbar-actions">
                        {matriculasSelecionadas.length > 0 && usuarioLogado.funcao !== 'SESMT' && <button className="btn btn-danger btn-sm" onClick={()=>{setMotivoExclusao('');setModalExclusaoAberto(!modalExclusaoAberto);}}>🗑️ Excluir Registro</button>}
                        <button className="btn btn-success btn-sm" onClick={exportarCSV}>📊 CSV</button>
                        <button className="btn btn-ghost btn-sm" onClick={exportarPDFLote}>📄 PDF</button>
                      </div>
                    </div>
                    {modalExclusaoAberto && matriculasSelecionadas.length > 0 && usuarioLogado.funcao !== 'SESMT' && (
                      <div style={{background:'var(--red-100)', padding:'16px', borderRadius:'var(--radius)', marginBottom:'16px', border:'1px solid var(--red-400)', animation:'fadeIn 0.3s ease'}}>
                        <label className="form-label" style={{color:'var(--red-600)'}}>Justificativa da Exclusão (Obrigatório)</label>
                        <div style={{display:'flex', gap:'10px', flexWrap:'wrap'}}>
                          <input className="form-input" type="text" value={motivoExclusao} onChange={e=>setMotivoExclusao(e.target.value)} placeholder="Motivo. Ex: Desligamento, Erro de digitação..." style={{flex:1, minWidth:'200px'}} autoFocus/>
                          <button className="btn btn-danger" disabled={motivoExclusao.trim().length<5} onClick={confirmarExclusao}>Confirmar Exclusão</button>
                          <button className="btn btn-ghost" onClick={()=>setModalExclusaoAberto(false)}>Cancelar</button>
                        </div>
                      </div>
                    )}
                    <div className="table-wrap">
                      <table className="data-table">
                        <thead><tr><th className="center" style={{width:'44px'}}><input type="checkbox" onChange={handleSelecionarTodos} checked={resultadosBusca.length>0&&matriculasSelecionadas.length===resultadosBusca.length}/></th><th>Colaborador</th><th>Matrícula</th><th>Setor</th><th className="center">Ação</th></tr></thead>
                        <tbody>{resultadosBusca.map((c,i)=><tr key={i}><td className="center"><input type="checkbox" checked={matriculasSelecionadas.includes(c.matricula)} onChange={()=>handleSelecionarUm(c.matricula)}/></td><td className="bold">{c.colaborador}</td><td className="mono">{c.matricula}</td><td>{c.setor}</td><td className="center"><button className="btn btn-success btn-sm" onClick={()=>verDetalhesColaborador(c)}>Ver Equipamentos →</button></td></tr>)}</tbody>
                      </table>
                    </div>
                  </div>
                )}
                {resultadosBusca.length===0&&termoBusca&&<div className="empty-state"><div className="empty-state-icon">🔎</div><div className="empty-state-text">Nenhum resultado encontrado</div></div>}
              </div>
            ) : (
              <div>
                <div className="collab-header">
                  <div>
                    <div className="collab-name">{colaboradorSelecionado.colaborador}</div>
                    <div className="collab-meta">
                      <span className="collab-meta-item">🪪 Matrícula: <strong>{colaboradorSelecionado.matricula}</strong></span>
                      {equipamentosColaborador[0]?.cpfCnpj && <span className="collab-meta-item">📄 {tipoDocumento(equipamentosColaborador[0].cpfCnpj)}: <strong>{formatarCpfCnpjExibicao(equipamentosColaborador[0].cpfCnpj)}</strong></span>}
                      <span className="collab-meta-item">🏢 Setor: <strong>{colaboradorSelecionado.setor}</strong></span>
                      <span className="collab-meta-item">🏭 Planta: <strong>{colaboradorSelecionado.planta}</strong></span>
                    </div>
                  </div>
                  <div className="collab-actions">
                    <button className="btn btn-ghost btn-sm" onClick={()=>{setColaboradorSelecionado(null);setEquipamentosSelecionadosParaBaixa([]);buscarNoInventario('');}}>← Voltar</button>
                    {temPendente && <>
                      <button className="btn btn-info btn-sm" onClick={()=>gerarLinkEmail(colaboradorSelecionado.matricula)}>🔗 Enviar Link</button>
                      <label className="btn btn-warning btn-sm" style={{cursor:'pointer'}}>📎 Anexar PDF<input type="file" accept="application/pdf" style={{display:'none'}} onChange={e=>fazerUploadFisico(e, colaboradorSelecionado.matricula)}/></label>
                    </>}
                  </div>
                </div>
                <div className="card">
                  <div className="card-title">🖥️ Equipamentos em Posse</div>
                  {equipamentosColaborador.length > 0 ? (
                    <>
                      <div className="toolbar toolbar-warning">
                        <span className="toolbar-info">Selecionados para baixa: <strong>{equipamentosSelecionadosParaBaixa.length}</strong> de <strong>{equipamentosColaborador.length}</strong></span>
                        <button className="btn btn-danger btn-sm" disabled={!equipamentosSelecionadosParaBaixa.length} onClick={handleAbrirModalBaixa}>🗑️ Dar Baixa nos Selecionados</button>
                      </div>
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead><tr><th className="center" style={{width:'44px'}}><input type="checkbox" onChange={handleSelecionarTodosEq} checked={equipamentosColaborador.length>0&&equipamentosSelecionadosParaBaixa.length===equipamentosColaborador.length}/></th><th style={{width:'60px'}}>Qtd</th><th>Equipamento</th><th>Patrimônio / Série</th><th>Foto</th><th>Data Entrega</th><th>Status Assinatura</th></tr></thead>
                          <tbody>{equipamentosColaborador.map(eq=><tr key={eq.id}><td className="center"><input type="checkbox" checked={equipamentosSelecionadosParaBaixa.includes(eq.id)} onChange={()=>handleSelecionarUmEq(eq.id)}/></td><td className="bold center">{eq.quantidade}</td><td className="bold">{eq.tipo}</td><td className="mono">{eq.patrimonio||'N/A'}</td><td className="center"><FotoThumb eq={eq}/></td><td style={{color:'var(--gray-500)', fontSize:'13px'}}>{new Date(eq.dataEntrega).toLocaleDateString('pt-BR')}</td><td><StatusBadge eq={eq} onAbrirComprovante={()=>setModalComprovanteAberto(true)}/></td></tr>)}</tbody>
                        </table>
                      </div>
                    </>
                  ) : <div className="empty-state"><div className="empty-state-icon">✅</div><div className="empty-state-text">Nenhum equipamento registrado</div></div>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ABA LOGS */}
        {abaAtiva==='logs' && usuarioLogado.funcao==='ADMIN' && (
          <div className="card">
            <div className="card-title">🔒 Histórico Geral de Movimentações</div>
            <div className="search-bar"><div className="search-input-wrap"><span className="search-icon">🔍</span><input className="search-input" type="text" placeholder="Buscar..." value={termoBuscaLogs} onChange={e=>setTermoBuscaLogs(e.target.value)}/></div></div>
            <div className="logs-wrap table-wrap">
              {logsFiltrados.length===0 ? <div className="empty-state"><div className="empty-state-icon">📋</div><div className="empty-state-text">Nenhum log encontrado</div></div> : logsFiltrados.map(log=>(
                <div key={log.id}>
                  <div className="log-row" onClick={()=>setExpandedLogId(expandedLogId===log.id?null:log.id)}>
                    <span className="log-time">{new Date(log.dataHora).toLocaleString('pt-BR')}</span>
                    <span className="log-user">{log.usuario}</span>
                    <span className="log-action">{log.acao}</span>
                    <span className="log-chevron">{expandedLogId===log.id?'▲':'▼'}</span>
                  </div>
                  {expandedLogId===log.id && <div className="log-expanded"><div className="log-exp-title">Data e Hora</div><div className="log-exp-text">{new Date(log.dataHora).toLocaleString('pt-BR')}</div><div className="log-exp-title">Usuário</div><div className="log-exp-text">{log.usuario}</div><div className="log-exp-title">Ação Completa</div><div className="log-exp-text">{log.acao}</div></div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ABA BAIXAS */}
        {abaAtiva==='logs-exclusoes' && usuarioLogado.funcao==='ADMIN' && (
          <div className="card">
            <div className="card-title card-title--danger">📉 Histórico de Baixas e Exclusões</div>
            <div className="search-bar"><div className="search-input-wrap"><span className="search-icon">🔍</span><input className="search-input" type="text" placeholder="Buscar..." value={termoBuscaBaixas} onChange={e=>setTermoBuscaBaixas(e.target.value)}/></div></div>
            <div className="logs-wrap table-wrap logs-wrap--danger">
              {logsBaixas.length===0 ? <div className="empty-state"><div className="empty-state-icon">📉</div><div className="empty-state-text">Nenhuma baixa ou exclusão encontrada</div></div> : logsBaixas.map(log=>(
                <div key={log.id}>
                  <div className="log-row log-row--baixa" onClick={()=>setExpandedLogId(expandedLogId===log.id?null:log.id)}>
                    <span className="log-time">{new Date(log.dataHora).toLocaleString('pt-BR')}</span>
                    <span className="log-user log-user--baixa">{log.usuario}</span>
                    <span className="log-action">{log.acao}</span>
                    <span className="log-chevron log-chevron--baixa">{expandedLogId===log.id?'▲':'▼'}</span>
                  </div>
                  {expandedLogId===log.id && <div className="log-expanded red"><div className="log-exp-title log-exp-title--baixa">Data e Hora</div><div className="log-exp-text">{new Date(log.dataHora).toLocaleString('pt-BR')}</div><div className="log-exp-title log-exp-title--baixa">Usuário</div><div className="log-exp-text">{log.usuario}</div><div className="log-exp-title log-exp-title--baixa">Ação / Justificativa</div><div className="log-exp-text">{log.acao}</div></div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ABA UTILIZADORES */}
        {abaAtiva==='usuarios' && usuarioLogado.funcao==='ADMIN' && (
          <div className="users-layout">
            <div className="users-form card">
              <div className="card-title" style={{fontSize:'15px'}}>👤 Novo Acesso</div>
              <form onSubmit={handleCadastrarUsuario}>
                <div className="form-group" style={{marginBottom:'14px'}}><label className="form-label">Login AD</label><input className="form-input" type="text" value={novoUserLogin} onChange={e=>setNovoUserLogin(e.target.value)} required placeholder="Ex: fulano.silva"/></div>
                <div className="form-group" style={{marginBottom:'14px'}}><label className="form-label">Nome Completo</label><input className="form-input" type="text" value={novoUserNome} onChange={e=>setNovoUserNome(e.target.value)} required placeholder="Ex: Fulano Silva"/></div>
                <div className="form-group" style={{marginBottom:'20px'}}><label className="form-label">Nível de Acesso</label><select className="form-select" value={novoUserFuncao} onChange={e=>setNovoUserFuncao(e.target.value)}><option value="OPERADOR">OPERADOR — Só gera termos</option><option value="SESMT">SESMT — Visualização e Baixas</option><option value="ADMIN">ADMIN — Acesso total</option></select></div>
                <button type="submit" className="btn btn-success btn-full">Autorizar Acesso ✓</button>
              </form>
            </div>
            <div className="users-list card">
              <div className="card-title" style={{fontSize:'15px'}}>👥 Utilizadores Autorizados</div>
              <div className="table-wrap">
                <table className="data-table">
                  <thead><tr><th>Nome</th><th>Login AD</th><th>Função</th><th className="center">Ações</th></tr></thead>
                  <tbody>{listaUsuarios.map(u=><tr key={u.id}><td className="bold">{u.nome}</td><td className="mono">{u.usuario}</td><td><select className={`role-select ${u.funcao==='ADMIN'?'role-admin':u.funcao==='SESMT'?'role-sesmt':'role-operator'}`} value={u.funcao} onChange={e=>handleAlterarFuncao(u.id,u.usuario,e.target.value)}><option value="OPERADOR">OPERADOR</option><option value="SESMT">SESMT</option><option value="ADMIN">ADMIN</option></select></td><td className="center"><button className="btn btn-danger btn-sm" onClick={()=>handleExcluirUsuario(u.id,u.usuario)}>Revogar ✕</button></td></tr>)}</tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PDF OCULTO */}
      <div style={{overflow:'hidden', height:0}}>
        <div id="inventario-lote-pdf" style={{width:'800px', padding:'40px', backgroundColor:'#fff', color:'#000', fontFamily:'Arial, sans-serif', fontSize:'13px'}}>
          <div style={{textAlign:'center', marginBottom:'30px', borderBottom:'2px solid #000', paddingBottom:'15px'}}><h2 style={{margin:0}}>MAGIUS METALÚRGICA INDUSTRIAL LTDA</h2><h3 style={{margin:'5px 0 0 0', color:'#444'}}>Relatório Consolidado de Inventário de TI - Ativos Cedidos</h3><p style={{fontSize:'12px', color:'#666', margin:'5px 0 0 0'}}>Gerado em: {new Date().toLocaleString('pt-BR')}</p></div>
          <table style={{width:'100%', borderCollapse:'collapse'}}>
            <thead><tr style={{backgroundColor:'#e0e0e0'}}><th style={{border:'1px solid #000', padding:'8px', textAlign:'left'}}>Colaborador</th><th style={{border:'1px solid #000', padding:'8px', textAlign:'left'}}>Matrícula</th><th style={{border:'1px solid #000', padding:'8px', textAlign:'left'}}>CPF/CNPJ</th><th style={{border:'1px solid #000', padding:'8px', textAlign:'left'}}>Setor / Planta</th><th style={{border:'1px solid #000', padding:'8px', textAlign:'left'}}>Equipamento</th><th style={{border:'1px solid #000', padding:'8px', textAlign:'left'}}>Patrimônio/Série</th><th style={{border:'1px solid #000', padding:'8px', textAlign:'center', width:'40px'}}>Qtd</th></tr></thead>
            <tbody>{dadosLotePDF.map((item,i)=><tr key={i}><td style={{border:'1px solid #000', padding:'8px', fontWeight:'bold'}}>{item.colaborador}</td><td style={{border:'1px solid #000', padding:'8px'}}>{item.matricula}</td><td style={{border:'1px solid #000', padding:'8px', fontSize:'11px'}}>{formatarCpfCnpjExibicao(item.cpfCnpj)}</td><td style={{border:'1px solid #000', padding:'8px', fontSize:'11px'}}>{item.setor} ({item.planta})</td><td style={{border:'1px solid #000', padding:'8px'}}>{item.tipo}</td><td style={{border:'1px solid #000', padding:'8px'}}>{item.patrimonio||'N/A'}</td><td style={{border:'1px solid #000', padding:'8px', textAlign:'center'}}>{item.quantidade}</td></tr>)}</tbody>
          </table>
          <p style={{marginTop:'40px', fontSize:'11px', color:'#555', textAlign:'center', borderTop:'1px solid #ccc', paddingTop:'10px'}}>Magius TI - Sistema de Gerenciamento de Ativos e Termos de Responsabilidade.</p>
        </div>
      </div>
    </div>
  );
}