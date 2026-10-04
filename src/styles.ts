// Framely tokens and SDK controls. Pages remain transparent; controls use the host's 6px radius, switches use a pill track.
export const css=`
:root{color-scheme:dark;--surface:#202226;--line:#35383e;--muted:#a4a8b0;--blue:#93c5ed;--text:#f0f1f3}
html body{padding:24px;background:transparent;color:var(--text);font:20px/1.5 system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased}
#root,.termix-panel,.termix-window{background:transparent}
.termix-panel{max-width:800px;margin:auto}
.termix-panel header{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:0 0 24px;border-bottom:1px solid var(--line)}
.termix-brand{display:flex;align-items:center;gap:12px;min-width:0}.termix-brand img{flex:none;display:block;width:52px;height:52px;border-radius:10px}.brand-copy{min-width:0}.termix-panel .termix-brand h1{font-size:24px;line-height:30px;letter-spacing:-.3px}.termix-brand .service-status{font-size:14px;line-height:20px;gap:6px;margin:2px 0 0!important}.termix-brand .service-status i{width:5px;height:5px}
.plugin-attribution{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px 20px;border-top:1px solid var(--line);padding:18px 0 0;color:var(--muted);font-size:14px}.plugin-attribution a{color:var(--muted);text-decoration:none}.plugin-attribution a:hover{color:var(--blue);text-decoration:underline}.plugin-attribution a:focus-visible{outline:2px solid var(--blue);outline-offset:4px}.plugin-attribution span{margin:0 5px}.plugin-attribution .external-arrow{margin:0}
.termix-panel h1{font-size:32px;font-weight:600;letter-spacing:-.6px;line-height:1.25;margin:0}
.termix-panel h2{font-size:22px;font-weight:600;line-height:1.35;margin:0 0 12px}
.termix-panel p{margin:0;line-height:1.55}
.termix-panel section{padding:24px 0;border-bottom:1px solid var(--line)}
.termix-panel button{min-height:50px;margin:0;padding:10px 18px;border:1px solid var(--line);border-radius:6px;background:#292c31;color:var(--text);white-space:nowrap;transition:background .12s,border-color .12s,transform .12s}
.termix-panel button:hover:not(:disabled){background:#363a41;border-color:#59616d}.termix-panel button:active:not(:disabled){transform:scale(.98)}
.termix-panel button:disabled{opacity:.4;cursor:default}
.termix-panel button.primary{background:#dce5ec;border-color:#dce5ec;color:#192129;font-weight:600}.termix-panel button.primary:hover:not(:disabled){background:#fff;border-color:#fff}
.termix-panel .open-button{min-width:104px}
.termix-panel button:focus-visible,.termix-panel input:focus-visible{outline:3px solid var(--blue);outline-offset:3px}
.termix-panel input:not([type=checkbox]){min-height:50px;margin:8px 0 0;padding:11px 14px;background:var(--surface);border:1px solid var(--line);color:var(--text);border-radius:6px;font-size:20px}
.termix-panel input::placeholder{color:var(--muted);opacity:1;font-size:18px}
.termix-panel input[type=number]{appearance:textfield;-moz-appearance:textfield}.termix-panel input[type=number]::-webkit-inner-spin-button,.termix-panel input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
.termix-panel input[role=switch]{appearance:none;-webkit-appearance:none;width:54px!important;height:30px!important;min-height:30px;margin:0;padding:0;position:relative;flex-shrink:0;border:1px solid #626974;border-radius:999px;background:#30343a;cursor:pointer;transition:background .12s,border-color .12s}
.termix-panel input[role=switch]::before{content:'';position:absolute;width:20px;height:20px;left:4px;top:4px;border-radius:50%;background:#edf0f4;transition:transform .12s}
.termix-panel input[role=switch]:checked{background:var(--blue);border-color:var(--blue)}.termix-panel input[role=switch]:checked::before{transform:translateX(24px);background:#192129}
.termix-panel input[role=switch]:disabled{opacity:.4;cursor:default}
.service-status{display:flex;align-items:center;gap:8px;font-size:17px;color:var(--muted);margin:8px 0 0!important}.service-status i{width:7px;height:7px;border-radius:50%;background:var(--muted);flex:none}.service-status.running i{background:var(--blue)}.service-status.failed i{background:#db9797}
.termix-panel small,.muted,.section-description,.field-hint{color:var(--muted);font-size:17px;line-height:1.55}
.termix-panel small{margin-top:4px}.section-description{margin-bottom:18px!important;max-width:48ch}
.service-controls>label{padding:0!important}.service-controls>.muted{margin-top:12px}
.credential-fields{display:grid;grid-template-columns:1fr 1fr;gap:20px}.credential-fields>label{min-width:0;padding:0!important;font-size:18px}
.account-actions{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-top:16px}.account-actions .field-hint{max-width:38ch}
.protocol-row{display:grid;grid-template-columns:minmax(0,1fr) 150px;gap:28px;align-items:center;padding:16px 0}.protocol-row+ .protocol-row{border-top:1px solid var(--line)}.protocol-row>label:not(.port-field){padding:0!important}
.protocol-row small{max-width:34ch}.port-field{display:block;font-size:17px;color:var(--muted)}.port-field input{width:100%;text-align:right;color:var(--text);font-variant-numeric:tabular-nums}
.network-settings .section-description{margin-bottom:12px!important}.interface{position:relative;padding:16px 0}.interface+.interface{border-top:1px solid var(--line)}.interface>label{padding:0!important}.interface-addresses{display:flex;flex-wrap:wrap;gap:4px 20px;padding:6px 72px 0 0;color:var(--muted);font-size:17px}.interface-addresses code{overflow-wrap:anywhere;color:var(--muted);font:18px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;font-variant-numeric:tabular-nums}
.language-settings{display:flex;align-items:center;justify-content:space-between;gap:20px}.language-settings h2{margin:0;flex:none}.language-settings .framely-select{width:220px;max-width:70%;flex:0 1 220px;min-width:0}.language-settings .framely-select>button{font-size:18px}.termix-panel .framely-select>button{justify-content:space-between;text-align:left;font-weight:400}
.termix-panel .framely-select [role=listbox]{background:#202328!important;border-color:#59616d!important;border-radius:6px;padding:6px!important}.termix-panel .framely-select [role=option]{border:0;border-radius:4px;white-space:normal;text-align:left;min-height:44px}.termix-panel .framely-select [role=option][aria-selected=true]{background:#3c434e!important;color:var(--text)}.termix-panel .framely-select [role=option]:hover{background:#363c45!important}
.termix-panel footer{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:20px 0}.termix-panel footer button{min-width:140px}
.addresses{border-bottom:0!important}.addresses code{display:block;padding:6px 0;color:var(--blue);font:18px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace;overflow-wrap:anywhere}
.certificate-export-result{margin-top:14px!important;font-size:16px;color:var(--muted)}.certificate-export-result code{display:block;overflow-wrap:anywhere;color:var(--blue);font-size:14px}
.certificate{display:grid;grid-template-columns:auto minmax(0,1fr);gap:18px;align-items:start;margin-top:16px}.certificate small{margin:0}.certificate code{display:block;font-size:14px;margin-top:4px;overflow-wrap:anywhere}
.notice{margin:16px 0;padding:14px 16px;border-radius:6px;background:#252930;border-left:3px solid #929ca9;color:#d5dbe4;overflow-wrap:anywhere;font-size:18px}.notice.error{background:#3a292d;border-color:#db9797;color:#f1b8b8}
.panel-loading>p{margin-top:12px}.loading-lines{display:grid;gap:20px;margin-top:32px}.loading-lines span{height:52px;border-radius:6px;background:var(--surface)}.loading-lines span:first-child{width:65%}
.termix-window{position:fixed;inset:0}.termix-window iframe{border:0;width:100%;height:100%;display:block;background:transparent}.window-message{padding:32px}
@media(max-width:640px){html body{padding:20px}.termix-panel header{gap:16px}.credential-fields{grid-template-columns:1fr;gap:16px}.account-actions{align-items:flex-start;flex-direction:column;gap:12px}.account-actions button{width:100%}.protocol-row{grid-template-columns:minmax(0,1fr) 112px;gap:16px}.protocol-row>label:not(.port-field){gap:12px!important}.protocol-row small{font-size:16px}.port-field{font-size:16px}.port-field input{padding:11px 8px!important}.termix-panel footer{gap:12px}.termix-panel footer button{min-width:120px}.certificate{grid-template-columns:1fr}.language-settings .framely-select{max-width:70%}}
@media(max-width:380px){html body{padding:16px}.protocol-row{grid-template-columns:1fr}.port-field{display:flex;align-items:center;justify-content:space-between;gap:16px}.port-field input{width:112px;margin-top:0!important}.termix-panel footer{align-items:flex-start;flex-direction:column}.termix-panel footer button{width:100%}}
@media(prefers-reduced-motion:reduce){.termix-panel button,.termix-panel input[role=switch],.termix-panel input[role=switch]::before{transition:none}}
`;
