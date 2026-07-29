import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, setDoc, onSnapshot,
  query, orderBy, limit, getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";

// ---------- Firebase ----------
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const colMateriais = collection(db, "materiais");
const colMaoDeObra = collection(db, "maoDeObra");
const colProdutos = collection(db, "produtos");
const colTabelas = collection(db, "tabelasPreco");
const colBackups = collection(db, "backups");

const statusEl = document.getElementById("status");
const setStatus = (text, cls) => {
  statusEl.textContent = text;
  statusEl.className = "status " + (cls || "");
};

// ---------- login ----------
const loginScreen = document.getElementById("login-screen");
const appShell = document.getElementById("app-shell");
let listenersIniciados = false;

function mensagemErroAuth(code) {
  const map = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-not-found": "Usuário não encontrado.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/too-many-requests": "Muitas tentativas. Tente novamente em instantes.",
  };
  return map[code] || "Não foi possível entrar. Tente novamente.";
}

onAuthStateChanged(auth, (user) => {
  if (user) {
    loginScreen.style.display = "none";
    appShell.style.display = "block";
    if (!listenersIniciados) { iniciarListeners(); listenersIniciados = true; }
  } else {
    loginScreen.style.display = "flex";
    appShell.style.display = "none";
  }
});

async function tentarLogin() {
  const email = document.getElementById("login-email").value.trim();
  const senha = document.getElementById("login-senha").value;
  const erroEl = document.getElementById("login-erro");
  erroEl.textContent = "";
  if (!email || !senha) { erroEl.textContent = "Preencha e-mail e senha."; return; }
  try {
    await signInWithEmailAndPassword(auth, email, senha);
  } catch (e) {
    erroEl.textContent = mensagemErroAuth(e.code);
  }
}
document.getElementById("login-btn").addEventListener("click", tentarLogin);
document.getElementById("login-senha").addEventListener("keydown", (e) => { if (e.key === "Enter") tentarLogin(); });
document.getElementById("login-email").addEventListener("keydown", (e) => { if (e.key === "Enter") tentarLogin(); });
document.getElementById("btn-logout").addEventListener("click", () => signOut(auth));

// ---------- tema claro/escuro ----------
const btnTema = document.getElementById("btn-tema");
function aplicarTema(tema) {
  if (tema === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
  btnTema.textContent = tema === "light" ? "☀️" : "🌙";
  localStorage.setItem("plastnova-tema", tema);
}
aplicarTema(localStorage.getItem("plastnova-tema") === "light" ? "light" : "dark");
btnTema.addEventListener("click", () => {
  const atual = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
  aplicarTema(atual === "light" ? "dark" : "light");
});

// ---------- backup ----------
const NOMES_COLECAO = { produtos: "Produtos", maoDeObra: "Mão de obra", materiais: "Matéria-prima", tabelasPreco: "Tabelas de preço" };
const COLECOES_BACKUP = [
  { chave: "produtos", get: () => state.produtos },
  { chave: "maoDeObra", get: () => state.maoDeObra },
  { chave: "materiais", get: () => state.materiais },
  { chave: "tabelasPreco", get: () => state.tabelas },
];

async function restaurarColecao(colName, itens) {
  for (const item of itens || []) {
    const { id, ...rest } = item;
    if (id) await setDoc(doc(db, colName, id), rest);
    else await addDoc(collection(db, colName), rest);
  }
}

// cria um novo "lote" de backup: 1 documento por aba, todos com o mesmo backupId
async function criarBackup(tipo) {
  const backupId = new Date().toISOString();
  for (const c of COLECOES_BACKUP) {
    await addDoc(colBackups, { backupId, colecao: c.chave, tipo, criadoEm: backupId, itens: c.get() });
  }
  return backupId;
}

async function dataUltimoBackup() {
  const snap = await getDocs(query(colBackups, orderBy("criadoEm", "desc"), limit(1)));
  if (snap.empty) return null;
  return snap.docs[0].data().criadoEm;
}

// roda uma vez, depois que as 4 coleções principais já carregaram do Firestore:
// se já se passaram 12h (ou nunca houve backup), gera um automaticamente
async function verificarBackupAutomatico() {
  try {
    const ultimo = await dataUltimoBackup();
    const DOZE_HORAS = 12 * 60 * 60 * 1000;
    if (!ultimo || Date.now() - new Date(ultimo).getTime() > DOZE_HORAS) {
      await criarBackup("automatico");
      if (views.ajustes.classList.contains("active")) renderAjustes();
    }
  } catch (err) {
    console.error("Falha ao verificar backup automático:", err);
  }
}

async function carregarHistoricoBackups() {
  const snap = await getDocs(query(colBackups, orderBy("criadoEm", "desc"), limit(80)));
  const porLote = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    if (!porLote[data.backupId]) porLote[data.backupId] = { backupId: data.backupId, tipo: data.tipo, criadoEm: data.criadoEm, partes: [] };
    porLote[data.backupId].partes.push({ docId: d.id, colecao: data.colecao, itens: data.itens || [] });
  });
  return Object.values(porLote).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
}

function baixarJson(nomeArquivo, dados) {
  const blob = new Blob([JSON.stringify(dados, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomeArquivo;
  a.click();
  URL.revokeObjectURL(url);
}

// restaurar/importar a partir de um arquivo .json baixado anteriormente (recuperação de desastre)
document.getElementById("backup-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirm("Isso vai sobrescrever os itens deste arquivo no banco de dados atual. Continuar?")) {
    e.target.value = "";
    return;
  }
  try {
    const data = JSON.parse(await file.text());
    await restaurarColecao("materiais", data.materiais);
    await restaurarColecao("maoDeObra", data.maoDeObra);
    await restaurarColecao("produtos", data.produtos);
    await restaurarColecao("tabelasPreco", data.tabelas);
    alert("Backup restaurado com sucesso.");
  } catch (err) {
    console.error(err);
    alert("Não foi possível ler esse arquivo de backup.");
  } finally {
    e.target.value = "";
  }
});


// ---------- estado local (espelha o Firestore em tempo real) ----------
const state = { materiais: [], maoDeObra: [], produtos: [], tabelas: [] };
const colecoesJaCarregadas = new Set();
const TOTAL_COLECOES_PRINCIPAIS = 4; // materiais, maoDeObra, produtos, tabelas

function listen(col, key, onUpdate) {
  onSnapshot(
    col,
    (snap) => {
      state[key] = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setStatus("sincronizado", "ok");
      onUpdate();
      if (!colecoesJaCarregadas.has(key)) {
        colecoesJaCarregadas.add(key);
        if (colecoesJaCarregadas.size === TOTAL_COLECOES_PRINCIPAIS) verificarBackupAutomatico();
      }
    },
    (err) => {
      console.error(err);
      setStatus("erro de conexão", "err");
    }
  );
}

// ---------- helpers ----------
const uidTmp = () => "tmp-" + Math.random().toString(36).slice(2, 9);
// preços de produtos/tabelas: sempre 2 casas, arredondado
const brl = (n) => (isFinite(n) ? n : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
// custo unitário de matéria-prima/mão de obra: até 5 casas, sem arredondar
const brl5 = (n) => (isFinite(n) ? n : 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2, maximumFractionDigits: 5 });
const numOr0 = (v) => {
  const n = parseFloat(String(v).replace(",", "."));
  return isFinite(n) ? n : 0;
};
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const UNIDADES = ["un", "kg", "g", "m", "cm", "L", "mL", "m²", "pacote"];
const UNIDADES_MAO = ["hora", "minuto", "un", "kg", "g", "m", "cm", "m²", "L", "mL", "pacote"];

// ---------- busca e ordenação das tabelas ----------
const filtros = {
  materiais: { busca: "", ordem: "nome-asc" },
  maoDeObra: { busca: "", ordem: "nome-asc" },
  tabelas: { busca: "", ordem: "nome-asc" },
  produtos: { busca: "", ordem: "nome-asc" },
};

function aplicarBuscaOrdem(lista, chaveFiltro, camposBusca, comparadores) {
  const f = filtros[chaveFiltro];
  let resultado = lista;
  if (f.busca.trim()) {
    const termo = f.busca.trim().toLowerCase();
    resultado = resultado.filter((item) => camposBusca.some((campo) => String(item[campo] ?? "").toLowerCase().includes(termo)));
  }
  const [campo, dir] = f.ordem.split("-");
  const cmp = comparadores[campo];
  if (cmp) {
    resultado = [...resultado].sort((a, b) => (dir === "asc" ? cmp(a, b) : cmp(b, a)));
  }
  return resultado;
}

// barra de busca + ordenação, reutilizada nas abas de cadastro
function renderBarraBusca(chaveFiltro, opcoesOrdem, placeholder) {
  const f = filtros[chaveFiltro];
  return `
    <div class="busca-bar">
      <input type="text" class="busca-input" data-busca="${chaveFiltro}" placeholder="${placeholder || "Buscar…"}" value="${esc(f.busca)}" />
      <select class="busca-ordem" data-ordem="${chaveFiltro}">
        ${opcoesOrdem.map((o) => `<option value="${o.value}" ${f.ordem === o.value ? "selected" : ""}>${o.label}</option>`).join("")}
      </select>
    </div>`;
}

// liga os eventos da barra de busca/ordenação a uma função de re-render
function ligarBarraBusca(el, chaveFiltro, rerender) {
  const inputBusca = el.querySelector(`[data-busca="${chaveFiltro}"]`);
  const selectOrdem = el.querySelector(`[data-ordem="${chaveFiltro}"]`);
  inputBusca?.addEventListener("input", () => { filtros[chaveFiltro].busca = inputBusca.value; rerender(); });
  selectOrdem?.addEventListener("change", () => { filtros[chaveFiltro].ordem = selectOrdem.value; rerender(); });
}

// ---------- navegação de abas ----------
const views = {
  produtos: document.getElementById("view-produtos"),
  materiais: document.getElementById("view-materiais"),
  maoDeObra: document.getElementById("view-maoDeObra"),
  tabelas: document.getElementById("view-tabelas"),
  ajustes: document.getElementById("view-ajustes"),
};
document.getElementById("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  const tab = btn.dataset.tab;
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
  Object.entries(views).forEach(([k, el]) => el.classList.toggle("active", k === tab));
  if (tab === "produtos") produtoEditorId = null, renderProdutos();
  if (tab === "tabelas") renderTabelas();
  if (tab === "ajustes") renderAjustes();
});

// =====================================================================
// MATERIAIS
// =====================================================================
let materialEditId = null;
function renderMateriais() {
  const el = views.materiais;
  const m = state.materiais.find((x) => x.id === materialEditId);
  el.innerHTML = `
    <div class="card cadastro-card">
      <h3 style="margin-bottom:16px;">${materialEditId ? "Editar material" : "Novo material"}</h3>
      <div class="row-2">
        <div class="field"><label>Nome</label>
          <input id="mat-nome" placeholder="Ex: Tecido algodão" value="${esc(m?.nome || "")}" />
        </div>
        <div class="field"><label>Unidade</label>
          <select id="mat-unidade">${UNIDADES.map((u) => `<option value="${u}" ${m?.unidade === u ? "selected" : ""}>${u}</option>`).join("")}</select>
        </div>
      </div>
      <div class="field" style="max-width:220px;"><label>Custo / unidade (até 5 casas)</label>
        <input id="mat-custo" placeholder="0,00000" value="${m ? m.custoUnitario : ""}" />
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" id="mat-submit">${materialEditId ? "Salvar" : "Adicionar"}</button>
        ${materialEditId ? `<button class="btn btn-ghost" id="mat-cancel">Cancelar</button>` : ""}
      </div>
    </div>

    ${renderBarraBusca("materiais", [
      { value: "nome-asc", label: "Nome (A–Z)" },
      { value: "nome-desc", label: "Nome (Z–A)" },
      { value: "custoUnitario-asc", label: "Custo (menor–maior)" },
      { value: "custoUnitario-desc", label: "Custo (maior–menor)" },
    ], "Buscar material…")}
    <div id="materiais-lista"></div>`;

  el.querySelector("#mat-submit").onclick = async () => {
    const nome = el.querySelector("#mat-nome").value.trim();
    if (!nome) return;
    const payload = { nome, unidade: el.querySelector("#mat-unidade").value, custoUnitario: numOr0(el.querySelector("#mat-custo").value) };
    if (materialEditId) await updateDoc(doc(db, "materiais", materialEditId), payload);
    else await addDoc(colMateriais, payload);
    materialEditId = null;
  };
  el.querySelector("#mat-cancel")?.addEventListener("click", () => { materialEditId = null; renderMateriais(); });
  ligarBarraBusca(el, "materiais", renderListaMateriaisCadastrados);
  renderListaMateriaisCadastrados();
}

function renderListaMateriaisCadastrados() {
  const box = document.getElementById("materiais-lista");
  if (!box) return;
  const lista = aplicarBuscaOrdem(state.materiais, "materiais", ["nome", "unidade"], {
    nome: (a, b) => a.nome.localeCompare(b.nome, "pt-BR"),
    custoUnitario: (a, b) => a.custoUnitario - b.custoUnitario,
  });

  if (state.materiais.length === 0) {
    box.innerHTML = `<div class="empty"><div class="t">Nenhum material cadastrado</div><div class="s">Adicione o primeiro material acima.</div></div>`;
    return;
  }
  if (lista.length === 0) {
    box.innerHTML = `<div class="empty"><div class="t">Nada encontrado</div><div class="s">Tente outro termo de busca.</div></div>`;
    return;
  }
  box.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Material</th><th>Unidade</th><th style="text-align:right">Custo/un</th><th></th></tr></thead>
      <tbody>
        ${lista.map((mm) => `
          <tr>
            <td>${esc(mm.nome)}</td>
            <td style="color:var(--muted)">${esc(mm.unidade)}</td>
            <td class="num">${brl5(mm.custoUnitario)}</td>
            <td><div class="actions-cell">
              <button class="icon-btn" data-edit="${mm.id}">✎</button>
              <button class="icon-btn danger" data-del="${mm.id}">🗑</button>
            </div></td>
          </tr>`).join("")}
      </tbody>
    </table></div>`;

  box.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => { materialEditId = b.dataset.edit; renderMateriais(); });
  box.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => { await deleteDoc(doc(db, "materiais", b.dataset.del)); });
}

// =====================================================================
// MÃO DE OBRA
// =====================================================================
let laborEditId = null;
function renderMaoDeObra() {
  const el = views.maoDeObra;
  const it = state.maoDeObra.find((x) => x.id === laborEditId);
  el.innerHTML = `
    <div class="card cadastro-card">
      <h3 style="margin-bottom:16px;">${laborEditId ? "Editar item" : "Novo item de mão de obra"}</h3>
      <div class="field"><label>Nome / função</label>
        <input id="lab-nome" placeholder="Ex: Costureira, Solda, Corte" value="${esc(it?.nome || "")}" />
      </div>
      <div class="row-2" style="max-width:460px;">
        <div class="field"><label>Unidade de cobrança</label>
          <select id="lab-unidade">${UNIDADES_MAO.map((u) => `<option value="${u}" ${(it?.unidade || "hora") === u ? "selected" : ""}>${u}</option>`).join("")}</select>
        </div>
        <div class="field"><label>Valor / unidade (até 5 casas)</label>
          <input id="lab-valor" placeholder="0,00000" value="${it ? it.valor : ""}" />
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn-primary" id="lab-submit">${laborEditId ? "Salvar" : "Adicionar"}</button>
        ${laborEditId ? `<button class="btn btn-ghost" id="lab-cancel">Cancelar</button>` : ""}
      </div>
    </div>

    ${renderBarraBusca("maoDeObra", [
      { value: "nome-asc", label: "Nome (A–Z)" },
      { value: "nome-desc", label: "Nome (Z–A)" },
      { value: "valor-asc", label: "Valor (menor–maior)" },
      { value: "valor-desc", label: "Valor (maior–menor)" },
    ], "Buscar item de mão de obra…")}
    <div id="mao-lista"></div>`;

  el.querySelector("#lab-submit").onclick = async () => {
    const nome = el.querySelector("#lab-nome").value.trim();
    if (!nome) return;
    const payload = { nome, unidade: el.querySelector("#lab-unidade").value, valor: numOr0(el.querySelector("#lab-valor").value) };
    if (laborEditId) await updateDoc(doc(db, "maoDeObra", laborEditId), payload);
    else await addDoc(colMaoDeObra, payload);
    laborEditId = null;
  };
  el.querySelector("#lab-cancel")?.addEventListener("click", () => { laborEditId = null; renderMaoDeObra(); });
  ligarBarraBusca(el, "maoDeObra", renderListaMaoCadastrada);
  renderListaMaoCadastrada();
}

function renderListaMaoCadastrada() {
  const box = document.getElementById("mao-lista");
  if (!box) return;
  const lista = aplicarBuscaOrdem(state.maoDeObra, "maoDeObra", ["nome", "unidade"], {
    nome: (a, b) => a.nome.localeCompare(b.nome, "pt-BR"),
    valor: (a, b) => a.valor - b.valor,
  });

  if (state.maoDeObra.length === 0) {
    box.innerHTML = `<div class="empty"><div class="t">Nenhum item de mão de obra</div><div class="s">Cadastre funções e seus valores acima.</div></div>`;
    return;
  }
  if (lista.length === 0) {
    box.innerHTML = `<div class="empty"><div class="t">Nada encontrado</div><div class="s">Tente outro termo de busca.</div></div>`;
    return;
  }
  box.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Item</th><th>Unidade</th><th style="text-align:right">Valor</th><th></th></tr></thead>
      <tbody>
        ${lista.map((ll) => `
          <tr>
            <td>${esc(ll.nome)}</td>
            <td style="color:var(--muted)">${esc(ll.unidade)}</td>
            <td class="num">${brl5(ll.valor)}/${esc(ll.unidade)}</td>
            <td><div class="actions-cell">
              <button class="icon-btn" data-edit="${ll.id}">✎</button>
              <button class="icon-btn danger" data-del="${ll.id}">🗑</button>
            </div></td>
          </tr>`).join("")}
      </tbody>
    </table></div>`;

  box.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => { laborEditId = b.dataset.edit; renderMaoDeObra(); });
  box.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => { await deleteDoc(doc(db, "maoDeObra", b.dataset.del)); });
}

// =====================================================================
// TABELAS DE PREÇO (regras globais aplicadas sobre o custo de qualquer tamanho)
// =====================================================================
let tabelaEditId = null;
const TIPOS_TABELA = [
  { value: "margem", label: "Margem sobre o preço (%)" },
  { value: "multiplicador", label: "Multiplicador direto (ex: 2 = dobro do custo)" },
  { value: "marketplace", label: "Marketplace (comissão + margem)" },
];

function renderTabelas() {
  const el = views.tabelas;
  const t = state.tabelas.find((x) => x.id === tabelaEditId);
  const tipo = t?.tipo || "margem";

  el.innerHTML = `
    <div class="card cadastro-card">
      <h3 style="margin-bottom:16px;">${tabelaEditId ? "Editar tabela" : "Nova tabela de preço"}</h3>
      <div class="row-2">
        <div class="field"><label>Nome</label>
          <input id="tab-nome" placeholder="Ex: Tabela A, Marketplace" value="${esc(t?.nome || "")}" />
        </div>
        <div class="field"><label>Regra</label>
          <select id="tab-tipo">${TIPOS_TABELA.map((o) => `<option value="${o.value}" ${tipo === o.value ? "selected" : ""}>${o.label}</option>`).join("")}</select>
        </div>
      </div>
      <div id="tab-campos"></div>
      <div class="btn-row">
        <button class="btn btn-primary" id="tab-submit">${tabelaEditId ? "Salvar" : "Adicionar"}</button>
        ${tabelaEditId ? `<button class="btn btn-ghost" id="tab-cancel">Cancelar</button>` : ""}
      </div>
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px;">
      ${renderBarraBusca("tabelas", [
        { value: "nome-asc", label: "Nome (A–Z)" },
        { value: "nome-desc", label: "Nome (Z–A)" },
      ], "Buscar tabela…")}
      <button class="btn btn-ghost" id="imprimir-tudo">🖨 Imprimir tabela de preços</button>
    </div>
    <div id="tabelas-lista"></div>`;

  function renderCampos(tipoAtual) {
    const campos = el.querySelector("#tab-campos");
    if (tipoAtual === "multiplicador") {
      campos.innerHTML = `<div class="field" style="max-width:320px;"><label>Multiplicador (ex: 2 para o dobro do custo)</label><input id="tab-valor" value="${t?.valor ?? 2}" /></div>`;
    } else if (tipoAtual === "marketplace") {
      campos.innerHTML = `
        <div class="row-2" style="max-width:460px;">
          <div class="field"><label>Comissão (%)</label><input id="tab-comissao" value="${t?.comissao ?? 16}" /></div>
          <div class="field"><label>Margem (%)</label><input id="tab-margem" value="${t?.margem ?? 20}" /></div>
        </div>`;
    } else {
      campos.innerHTML = `<div class="field" style="max-width:320px;"><label>Margem sobre o preço (%)</label><input id="tab-valor" value="${t?.valor ?? 30}" /></div>`;
    }
  }
  renderCampos(tipo);
  el.querySelector("#tab-tipo").addEventListener("change", (e) => renderCampos(e.target.value));

  el.querySelector("#tab-submit").onclick = async () => {
    const nome = el.querySelector("#tab-nome").value.trim();
    if (!nome) return;
    const tipoSel = el.querySelector("#tab-tipo").value;
    let payload = { nome, tipo: tipoSel };
    if (tipoSel === "multiplicador") payload.valor = numOr0(el.querySelector("#tab-valor").value);
    else if (tipoSel === "marketplace") {
      payload.comissao = numOr0(el.querySelector("#tab-comissao").value);
      payload.margem = numOr0(el.querySelector("#tab-margem").value);
    } else payload.valor = numOr0(el.querySelector("#tab-valor").value);

    if (tabelaEditId) await updateDoc(doc(db, "tabelasPreco", tabelaEditId), payload);
    else await addDoc(colTabelas, payload);
    tabelaEditId = null;
  };
  el.querySelector("#tab-cancel")?.addEventListener("click", () => { tabelaEditId = null; renderTabelas(); });
  el.querySelector("#imprimir-tudo").onclick = () => imprimirTabelaGeral();
  ligarBarraBusca(el, "tabelas", renderListaTabelasCadastradas);
  renderListaTabelasCadastradas();
}

function renderListaTabelasCadastradas() {
  const box = document.getElementById("tabelas-lista");
  if (!box) return;
  const lista = aplicarBuscaOrdem(state.tabelas, "tabelas", ["nome"], {
    nome: (a, b) => a.nome.localeCompare(b.nome, "pt-BR"),
  });

  if (state.tabelas.length === 0) {
    box.innerHTML = `<div class="empty"><div class="t">Nenhuma tabela cadastrada</div><div class="s">Crie a Tabela A, B, C ou Marketplace acima. Um exemplo de custo de R$ 100 aparece na coluna de teste.</div></div>`;
    return;
  }
  if (lista.length === 0) {
    box.innerHTML = `<div class="empty"><div class="t">Nada encontrado</div><div class="s">Tente outro termo de busca.</div></div>`;
    return;
  }
  box.innerHTML = `<div class="table-wrap"><table>
      <thead><tr><th>Tabela</th><th>Regra</th><th style="text-align:right">Exemplo (custo R$100)</th><th></th></tr></thead>
      <tbody>
        ${lista.map((tt) => `
          <tr>
            <td>${esc(tt.nome)}</td>
            <td style="color:var(--muted);font-size:12px;">${descricaoTabela(tt)}</td>
            <td class="num">${brl(calcPrecoTabela(tt, 100))}</td>
            <td><div class="actions-cell">
              <button class="icon-btn" data-edit="${tt.id}">✎</button>
              <button class="icon-btn danger" data-del="${tt.id}">🗑</button>
            </div></td>
          </tr>`).join("")}
      </tbody>
    </table></div>`;

  box.querySelectorAll("[data-edit]").forEach((b) => b.onclick = () => { tabelaEditId = b.dataset.edit; renderTabelas(); });
  box.querySelectorAll("[data-del]").forEach((b) => b.onclick = async () => { await deleteDoc(doc(db, "tabelasPreco", b.dataset.del)); });
}

function descricaoTabela(t) {
  if (t.tipo === "multiplicador") return `custo × ${numOr0(t.valor)}`;
  if (t.tipo === "marketplace") return `comissão ${numOr0(t.comissao)}% + margem ${numOr0(t.margem)}%`;
  return `margem ${numOr0(t.valor)}% sobre o preço`;
}

// =====================================================================
// AJUSTES (backup e futuras configurações do sistema)
// =====================================================================
function formatarDataHora(iso) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function renderAjustes() {
  const el = views.ajustes;
  el.innerHTML = `
    <div class="card" style="max-width:640px;margin-bottom:20px;">
      <h3 style="margin-bottom:6px;">Backup</h3>
      <p class="italic-muted" style="padding-top:0;">
        Backup automático a cada 12h (conferido sempre que o app é aberto — cobre os
        2x ao dia mesmo sem servidor rodando o tempo todo). Cada backup salva
        <strong>materiais, mão de obra, produtos e tabelas de preço separadamente</strong>,
        direto no Firestore.
      </p>
      <div class="btn-row" style="margin-top:12px;">
        <button class="btn btn-primary" id="ajustes-backup-agora">⬇ Fazer backup agora</button>
        <button class="btn btn-ghost" id="ajustes-restore-arquivo">⬆ Importar de arquivo</button>
      </div>
    </div>
    <div class="card" style="max-width:760px;">
      <h3 style="margin-bottom:12px;">Histórico de backups</h3>
      <div id="lista-backups"><p class="italic-muted">Carregando…</p></div>
    </div>`;

  el.querySelector("#ajustes-backup-agora").onclick = async (e) => {
    e.target.disabled = true;
    e.target.textContent = "Fazendo backup…";
    await criarBackup("manual");
    await carregarListaBackups();
    e.target.disabled = false;
    e.target.textContent = "⬇ Fazer backup agora";
  };
  el.querySelector("#ajustes-restore-arquivo").onclick = () => document.getElementById("backup-file").click();

  await carregarListaBackups();
}

async function carregarListaBackups() {
  const box = document.getElementById("lista-backups");
  if (!box) return;
  const lotes = await carregarHistoricoBackups();

  if (lotes.length === 0) {
    box.innerHTML = `<p class="italic-muted">Nenhum backup ainda. Clique em "Fazer backup agora" ou aguarde o automático.</p>`;
    return;
  }

  box.innerHTML = lotes.map((lote) => `
    <div class="backup-lote">
      <div class="backup-lote-head">
        <span class="backup-data">${formatarDataHora(lote.criadoEm)}</span>
        <span class="backup-badge ${lote.tipo === "manual" ? "manual" : "auto"}">${lote.tipo === "manual" ? "Manual" : "Automático"}</span>
        <button class="icon-btn danger" data-del-lote="${lote.backupId}" title="Excluir este backup">🗑</button>
      </div>
      <div class="backup-partes">
        ${lote.partes.map((p) => `
          <div class="backup-parte">
            <span>${esc(NOMES_COLECAO[p.colecao] || p.colecao)} <span class="faint-count">(${p.itens.length})</span></span>
            <div class="backup-parte-acoes">
              <button class="icon-btn" data-baixar-parte="${p.docId}" title="Baixar esta aba">⬇</button>
              <button class="icon-btn" data-restaurar-parte="${p.docId}" title="Restaurar esta aba">↺</button>
            </div>
          </div>`).join("")}
      </div>
    </div>`).join("");

  // guarda os lotes em memória pra achar rapidamente ao clicar nos botões
  box.dataset.ready = "1";
  window.__ultimosLotesBackup = lotes;

  box.querySelectorAll("[data-baixar-parte]").forEach((b) => b.onclick = () => {
    const parte = achaParteBackup(b.dataset.baixarParte);
    if (!parte) return;
    baixarJson(`plastnova-${parte.colecao}-${new Date().toISOString().slice(0, 10)}.json`, parte.itens);
  });
  box.querySelectorAll("[data-restaurar-parte]").forEach((b) => b.onclick = async () => {
    const parte = achaParteBackup(b.dataset.restaurarParte);
    if (!parte) return;
    if (!confirm(`Restaurar "${NOMES_COLECAO[parte.colecao] || parte.colecao}" a partir deste backup? Isso sobrescreve os itens atuais dessa aba.`)) return;
    await restaurarColecao(parte.colecao, parte.itens);
    alert("Restaurado com sucesso.");
  });
  box.querySelectorAll("[data-del-lote]").forEach((b) => b.onclick = async () => {
    if (!confirm("Excluir este backup do histórico? Isso não afeta os dados atuais, só remove esta cópia salva.")) return;
    const lote = lotes.find((l) => l.backupId === b.dataset.delLote);
    if (!lote) return;
    for (const p of lote.partes) await deleteDoc(doc(db, "backups", p.docId));
    await carregarListaBackups();
  });
}

function achaParteBackup(docId) {
  for (const lote of window.__ultimosLotesBackup || []) {
    const p = lote.partes.find((x) => x.docId === docId);
    if (p) return p;
  }
  return null;
}


// =====================================================================
// PRODUTOS (com tamanhos/variações + itens gerais)
// =====================================================================
let produtoEditorId = null; // null = lista | "new" | id existente
// rascunho em edição (tamanhos ainda não salvos)
let draft = null;

function custoItens(itensMaterial, itensMao) {
  const cM = (itensMaterial || []).reduce((s, it) => {
    const m = state.materiais.find((x) => x.id === it.materialId);
    return s + (m ? m.custoUnitario * numOr0(it.quantidade) : 0);
  }, 0);
  const cL = (itensMao || []).reduce((s, it) => {
    const l = state.maoDeObra.find((x) => x.id === it.itemId);
    return s + (l ? l.valor * numOr0(it.quantidade) : 0);
  }, 0);
  return cM + cL;
}

// retorna a quantidade "efetiva" de um item geral para este tamanho:
// usa o ajuste específico se existir, senão cai no valor padrão do produto
function efetivo(map, id, padrao) {
  return map && Object.prototype.hasOwnProperty.call(map, id) ? map[id] : padrao;
}

// aplica os ajustes por tamanho (se houver) sobre os itens gerais do produto
function itensGeraisEfetivos(produto, variacao) {
  const mats = (produto.itensMaterialGerais || []).map((it) => ({
    ...it,
    quantidade: efetivo(variacao.overridesMaterial, it.id, it.quantidade),
  }));
  const maos = (produto.itensMaoGerais || []).map((it) => ({
    ...it,
    quantidade: efetivo(variacao.overridesMao, it.id, it.quantidade),
  }));
  return { mats, maos };
}

// custo de uma variação = itens gerais do produto (com eventuais ajustes deste tamanho) + itens específicos
function calcVariacao(produto, variacao) {
  const { mats, maos } = itensGeraisEfetivos(produto, variacao);
  const custoGerais = custoItens(mats, maos);
  const custoEspecifico = custoItens(variacao.itensMaterial, variacao.itensMao);
  const direto = custoGerais + custoEspecifico;
  const indiretosVal = direto * (numOr0(produto.indiretos) / 100);
  const total = direto + indiretosVal;
  return { custoGerais, custoEspecifico, indiretosVal, total };
}

// aplica a regra de uma tabela de preço sobre um custo total
function calcPrecoTabela(tabela, custoTotal) {
  if (tabela.tipo === "multiplicador") {
    return custoTotal * numOr0(tabela.valor);
  }
  if (tabela.tipo === "marketplace") {
    const soma = numOr0(tabela.comissao) + numOr0(tabela.margem);
    return soma < 100 ? custoTotal / (1 - soma / 100) : custoTotal;
  }
  // tipo "margem" (padrão): margem sobre o preço de venda
  const v = numOr0(tabela.valor);
  return v < 100 ? custoTotal / (1 - v / 100) : custoTotal;
}

function novaVariacao(nome) {
  return { id: uidTmp(), nome: nome || "Novo tamanho", codigo: "", itensMaterial: [], itensMao: [], overridesMaterial: {}, overridesMao: {} };
}

function renderProdutos() {
  const el = views.produtos;

  if (produtoEditorId !== null) {
    renderProdutoEditor(el);
    return;
  }

  el.innerHTML = `
    <div style="display:flex;justify-content:flex-end;margin-bottom:16px;">
      <button class="btn btn-primary" id="novo-produto">+ Novo produto</button>
    </div>
    ${renderBarraBusca("produtos", [
      { value: "nome-asc", label: "Nome (A–Z)" },
      { value: "nome-desc", label: "Nome (Z–A)" },
    ], "Buscar produto ou código…")}
    <div id="produtos-lista"></div>`;

  el.querySelector("#novo-produto").onclick = () => {
    produtoEditorId = "new";
    draft = { nome: "", codigo: "", indiretos: 0, itensMaterialGerais: [], itensMaoGerais: [], variacoes: [novaVariacao("Tamanho único")] };
    renderProdutos();
  };
  ligarBarraBusca(el, "produtos", renderListaProdutosCadastrados);
  renderListaProdutosCadastrados();
}

function renderListaProdutosCadastrados() {
  const box = document.getElementById("produtos-lista");
  if (!box) return;
  const lista = aplicarBuscaOrdem(state.produtos, "produtos", ["nome", "codigo"], {
    nome: (a, b) => a.nome.localeCompare(b.nome, "pt-BR"),
  });

  if (state.produtos.length === 0) {
    box.innerHTML = `<div class="empty"><div class="t">Nenhum produto cadastrado</div><div class="s">Cadastre materiais e mão de obra primeiro, depois monte seu produto aqui.</div></div>`;
    return;
  }
  if (lista.length === 0) {
    box.innerHTML = `<div class="empty"><div class="t">Nada encontrado</div><div class="s">Tente outro termo de busca.</div></div>`;
    return;
  }
  box.innerHTML = `<div class="produtos-grid">
      ${lista.map((p) => {
        const variacoes = p.variacoes && p.variacoes.length ? p.variacoes : [];
        const custos = variacoes.map((v) => calcVariacao(p, v).total);
        const min = custos.length ? Math.min(...custos) : 0;
        const max = custos.length ? Math.max(...custos) : 0;
        return `<button class="produto-card" data-open="${p.id}">
          <div class="top"><h4>${esc(p.nome)}</h4><span style="color:var(--faint)">›</span></div>
          ${p.codigo ? `<div class="codigo-badge">${esc(p.codigo)}</div>` : ""}
          <div class="meta">${variacoes.length} tamanho${variacoes.length === 1 ? "" : "s"} · custo</div>
          <div class="price">${custos.length === 0 ? "—" : min === max ? brl(min) : `${brl(min)} – ${brl(max)}`}</div>
        </button>`;
      }).join("")}
    </div>`;

  box.querySelectorAll("[data-open]").forEach((b) => b.onclick = () => {
    const p = state.produtos.find((x) => x.id === b.dataset.open);
    produtoEditorId = p.id;
    draft = JSON.parse(JSON.stringify(p));
    if (!draft.codigo) draft.codigo = "";
    if (!draft.variacoes || draft.variacoes.length === 0) draft.variacoes = [novaVariacao("Tamanho único")];
    if (!draft.itensMaterialGerais) draft.itensMaterialGerais = [];
    if (!draft.itensMaoGerais) draft.itensMaoGerais = [];
    // compatibilidade com produtos salvos antes dos ajustes por tamanho / código existirem
    draft.itensMaterialGerais.forEach((it) => { if (!it.id) it.id = uidTmp(); });
    draft.itensMaoGerais.forEach((it) => { if (!it.id) it.id = uidTmp(); });
    draft.variacoes.forEach((v) => {
      if (!v.overridesMaterial) v.overridesMaterial = {};
      if (!v.overridesMao) v.overridesMao = {};
      if (v.codigo === undefined) v.codigo = "";
    });
    renderProdutos();
  });
}

// gera o HTML de uma lista de itens (materiais OU mão de obra), reutilizado tanto
// para os itens gerais do produto quanto para os itens específicos de cada tamanho
function renderListaMateriais(itens, scopeAttr) {
  if (!itens.length) return `<div class="italic-muted">Nenhum material adicionado.</div>`;
  return itens.map((it, iIdx) => {
    const m = state.materiais.find((x) => x.id === it.materialId);
    return `<div class="item-row">
      <select ${scopeAttr} data-mat-idx="${iIdx}">${state.materiais.map((mm) => `<option value="${mm.id}" ${mm.id === it.materialId ? "selected" : ""}>${esc(mm.nome)} (${brl5(mm.custoUnitario)}/${mm.unidade})</option>`).join("")}</select>
      <input class="qty" ${scopeAttr} data-mat-qty="${iIdx}" value="${it.quantidade}" />
      <span class="unit">${m?.unidade || ""}</span>
      <button class="icon-btn danger" ${scopeAttr} data-mat-del="${iIdx}">🗑</button>
    </div>`;
  }).join("");
}
function renderListaMao(itens, scopeAttr) {
  if (!itens.length) return `<div class="italic-muted">Nenhum item de mão de obra adicionado.</div>`;
  return itens.map((it, iIdx) => {
    const l = state.maoDeObra.find((x) => x.id === it.itemId);
    return `<div class="item-row">
      <select ${scopeAttr} data-mao-idx="${iIdx}">${state.maoDeObra.map((ll) => `<option value="${ll.id}" ${ll.id === it.itemId ? "selected" : ""}>${esc(ll.nome)} (${brl5(ll.valor)}/${ll.unidade})</option>`).join("")}</select>
      <input class="qty" ${scopeAttr} data-mao-qty="${iIdx}" value="${it.quantidade}" />
      <span class="unit">${l?.unidade || ""}</span>
      <button class="icon-btn danger" ${scopeAttr} data-mao-del="${iIdx}">🗑</button>
    </div>`;
  }).join("");
}

// para cada tamanho, permite sobrescrever a quantidade de um item geral específico
// (ou zerar, se aquele tamanho não usa aquele item) sem afetar os demais tamanhos
function renderAjustesGerais(produto, variacao, vIdx) {
  const mats = produto.itensMaterialGerais || [];
  const maos = produto.itensMaoGerais || [];
  if (mats.length === 0 && maos.length === 0) return "";

  const matRows = mats.map((it) => {
    const m = state.materiais.find((x) => x.id === it.materialId);
    const qtd = efetivo(variacao.overridesMaterial, it.id, it.quantidade);
    const alterado = variacao.overridesMaterial && Object.prototype.hasOwnProperty.call(variacao.overridesMaterial, it.id);
    return `<div class="item-row">
      <span style="flex:1;font-size:13px;color:var(--ink-soft);">${esc(m?.nome || "?")} <span style="color:var(--faint)">(padrão: ${it.quantidade})</span></span>
      <input class="qty" data-ov-mat="${vIdx}|${it.id}" value="${qtd}" />
      <span class="unit">${m?.unidade || ""}</span>
      ${alterado ? `<button class="icon-btn" data-ov-mat-reset="${vIdx}|${it.id}" title="Usar valor padrão">↺</button>` : `<span style="width:32px;display:inline-block;"></span>`}
    </div>`;
  }).join("");

  const maoRows = maos.map((it) => {
    const l = state.maoDeObra.find((x) => x.id === it.itemId);
    const qtd = efetivo(variacao.overridesMao, it.id, it.quantidade);
    const alterado = variacao.overridesMao && Object.prototype.hasOwnProperty.call(variacao.overridesMao, it.id);
    return `<div class="item-row">
      <span style="flex:1;font-size:13px;color:var(--ink-soft);">${esc(l?.nome || "?")} <span style="color:var(--faint)">(padrão: ${it.quantidade})</span></span>
      <input class="qty" data-ov-mao="${vIdx}|${it.id}" value="${qtd}" />
      <span class="unit">${l?.unidade || ""}</span>
      ${alterado ? `<button class="icon-btn" data-ov-mao-reset="${vIdx}|${it.id}" title="Usar valor padrão">↺</button>` : `<span style="width:32px;display:inline-block;"></span>`}
    </div>`;
  }).join("");

  return `
    <div class="section-title" style="margin-top:14px;"><h4>Ajustes dos itens gerais (opcional)</h4></div>
    <p class="italic-muted">Deixe como está pra usar o padrão do produto. Mude a quantidade (ou zere) só se este tamanho for diferente.</p>
    ${matRows}${maoRows}`;
}

function renderProdutoEditor(el) {
  const p = draft;
  const isNew = produtoEditorId === "new";

  const variacoesHtml = p.variacoes.map((v, vIdx) => {
    const calc = calcVariacao(p, v);
    return `
    <div class="variacao-card" data-var="${vIdx}">
      <div class="variacao-head">
        <input data-var-nome="${vIdx}" value="${esc(v.nome)}" placeholder="Ex: 1,40 x 2,20m" style="flex:2;" />
        <input data-var-codigo="${vIdx}" value="${esc(v.codigo || "")}" placeholder="Código interno" style="flex:1;" />
        <button class="icon-btn" data-var-dup="${vIdx}" title="Duplicar tamanho">⧉</button>
        ${p.variacoes.length > 1 ? `<button class="icon-btn danger" data-var-del="${vIdx}" title="Excluir tamanho">🗑</button>` : ""}
      </div>

      <div class="section-title"><h4>Materiais específicos deste tamanho</h4>
        <button class="link-btn" data-add-mat="${vIdx}" ${state.materiais.length === 0 ? "disabled" : ""}>+ adicionar</button>
      </div>
      ${renderListaMateriais(v.itensMaterial, `data-var="${vIdx}"`)}

      <div class="section-title" style="margin-top:14px;"><h4>Mão de obra específica deste tamanho</h4>
        <button class="link-btn" data-add-mao="${vIdx}" ${state.maoDeObra.length === 0 ? "disabled" : ""}>+ adicionar</button>
      </div>
      ${renderListaMao(v.itensMao, `data-var="${vIdx}"`)}

      ${renderAjustesGerais(p, v, vIdx)}

      <div class="mini-ficha">
        <div><span class="l">Custo ${esc(v.nome)} (geral + específico)</span><br/><span class="c">${brl(calc.total)}${v.codigo ? ` · código ${esc(v.codigo)}` : ""}</span></div>
      </div>
      <div class="tabelas-precos">
        ${state.tabelas.length === 0
          ? `<p class="italic-muted">Nenhuma tabela de preço cadastrada ainda — vá em "Tabelas de preço".</p>`
          : state.tabelas.map((t) => `<div class="tabela-preco-linha"><span class="nome">${esc(t.nome)}</span><span class="valor">${brl(calcPrecoTabela(t, calc.total))}</span></div>`).join("")
        }
      </div>
    </div>`;
  }).join("");

  el.innerHTML = `
    <div class="card">
      <div class="editor-top">
        <div class="row-2" style="flex:1;">
          <div class="field" style="margin:0;">
            <label>Nome do produto</label>
            <input id="prod-nome" placeholder="Ex: Cortina corta luz" value="${esc(p.nome)}" />
          </div>
          <div class="field" style="margin:0;">
            <label>Código interno (opcional)</label>
            <input id="prod-codigo" placeholder="Ex: CORT-CL" value="${esc(p.codigo || "")}" />
          </div>
        </div>
        <button class="icon-btn" id="prod-close" style="border:none;">✕</button>
      </div>
      <p class="italic-muted" style="padding-top:0;">Se cada tamanho tiver um código próprio no seu sistema de vendas, preencha o código dentro de cada tamanho abaixo — ele tem prioridade sobre este.</p>

      <div class="field" style="margin-bottom:20px;max-width:220px;">
        <label>Custos indiretos (%)</label><input id="prod-indiretos" value="${p.indiretos}" />
      </div>

      <div class="variacao-card" style="border-color: var(--gold);">
        <h4 style="color:var(--ink-soft);margin-bottom:2px;">Itens gerais do produto</h4>
        <p class="italic-muted" style="padding:0 0 10px 0;">Entram no custo de <strong>todos os tamanhos</strong> — ex: embalagem, energia elétrica, etiqueta.</p>

        <div class="section-title"><h4>Materiais gerais</h4>
          <button class="link-btn" id="add-mat-geral" ${state.materiais.length === 0 ? "disabled" : ""}>+ adicionar</button>
        </div>
        ${renderListaMateriais(p.itensMaterialGerais, `data-geral="mat"`)}

        <div class="section-title" style="margin-top:14px;"><h4>Mão de obra geral</h4>
          <button class="link-btn" id="add-mao-geral" ${state.maoDeObra.length === 0 ? "disabled" : ""}>+ adicionar</button>
        </div>
        ${renderListaMao(p.itensMaoGerais, `data-geral="mao"`)}
      </div>

      <div class="section-title" style="margin-top:8px;"><h4>Tamanhos</h4></div>
      ${variacoesHtml}
      <button class="add-tamanho-btn" id="add-tamanho">+ Adicionar tamanho</button>

      <div class="editor-footer">
        <div style="display:flex;gap:16px;align-items:center;">
          ${!isNew ? `<button class="delete-link" id="prod-delete">🗑 Excluir produto</button>` : ""}
          ${!isNew ? `<button class="link-btn" id="prod-print">🖨 Imprimir esta ficha</button>` : ""}
        </div>
        <button class="btn btn-primary" id="prod-salvar">💾 Salvar produto</button>
      </div>
    </div>`;

  const syncSimple = () => {
    draft.nome = el.querySelector("#prod-nome").value;
    draft.codigo = el.querySelector("#prod-codigo").value;
    draft.indiretos = el.querySelector("#prod-indiretos").value;
  };
  el.querySelector("#prod-indiretos").addEventListener("input", () => { syncSimple(); renderProdutoEditor(el); });
  el.querySelector("#prod-nome").addEventListener("input", () => { draft.nome = el.querySelector("#prod-nome").value; });
  el.querySelector("#prod-codigo").addEventListener("input", () => { draft.codigo = el.querySelector("#prod-codigo").value; });
  el.querySelector("#prod-close").onclick = () => { produtoEditorId = null; draft = null; renderProdutos(); };

  el.querySelector("#add-tamanho").onclick = () => { draft.variacoes.push(novaVariacao(`Tamanho ${draft.variacoes.length + 1}`)); renderProdutoEditor(el); };

  el.querySelectorAll("[data-var-nome]").forEach((i) => i.addEventListener("input", () => { draft.variacoes[+i.dataset.varNome].nome = i.value; }));
  el.querySelectorAll("[data-var-codigo]").forEach((i) => i.addEventListener("input", () => { draft.variacoes[+i.dataset.varCodigo].codigo = i.value; }));
  el.querySelectorAll("[data-var-dup]").forEach((b) => b.onclick = () => {
    const v = draft.variacoes[+b.dataset.varDup];
    const copia = JSON.parse(JSON.stringify(v));
    copia.id = uidTmp();
    copia.nome = v.nome + " (cópia)";
    copia.codigo = "";
    draft.variacoes.splice(+b.dataset.varDup + 1, 0, copia);
    renderProdutoEditor(el);
  });
  el.querySelectorAll("[data-var-del]").forEach((b) => b.onclick = () => { draft.variacoes.splice(+b.dataset.varDel, 1); renderProdutoEditor(el); });

  // --- itens específicos de cada tamanho ---
  el.querySelectorAll("[data-add-mat]").forEach((b) => b.onclick = () => {
    if (state.materiais.length === 0) return;
    draft.variacoes[+b.dataset.addMat].itensMaterial.push({ materialId: state.materiais[0].id, quantidade: 1 });
    renderProdutoEditor(el);
  });
  el.querySelectorAll("[data-add-mao]").forEach((b) => b.onclick = () => {
    if (state.maoDeObra.length === 0) return;
    draft.variacoes[+b.dataset.addMao].itensMao.push({ itemId: state.maoDeObra[0].id, quantidade: 1 });
    renderProdutoEditor(el);
  });
  el.querySelectorAll("[data-var][data-mat-idx]").forEach((s) => s.onchange = () => { draft.variacoes[+s.dataset.var].itensMaterial[+s.dataset.matIdx].materialId = s.value; renderProdutoEditor(el); });
  el.querySelectorAll("[data-var][data-mat-qty]").forEach((i) => i.oninput = () => { draft.variacoes[+i.dataset.var].itensMaterial[+i.dataset.matQty].quantidade = i.value; renderProdutoEditor(el); });
  el.querySelectorAll("[data-var][data-mat-del]").forEach((b) => b.onclick = () => { draft.variacoes[+b.dataset.var].itensMaterial.splice(+b.dataset.matDel, 1); renderProdutoEditor(el); });
  el.querySelectorAll("[data-var][data-mao-idx]").forEach((s) => s.onchange = () => { draft.variacoes[+s.dataset.var].itensMao[+s.dataset.maoIdx].itemId = s.value; renderProdutoEditor(el); });
  el.querySelectorAll("[data-var][data-mao-qty]").forEach((i) => i.oninput = () => { draft.variacoes[+i.dataset.var].itensMao[+i.dataset.maoQty].quantidade = i.value; renderProdutoEditor(el); });
  el.querySelectorAll("[data-var][data-mao-del]").forEach((b) => b.onclick = () => { draft.variacoes[+b.dataset.var].itensMao.splice(+b.dataset.maoDel, 1); renderProdutoEditor(el); });

  // --- ajustes de itens gerais por tamanho ---
  el.querySelectorAll("[data-ov-mat]").forEach((i) => i.oninput = () => {
    const [vIdx, itemId] = i.dataset.ovMat.split("|");
    const v = draft.variacoes[+vIdx];
    if (!v.overridesMaterial) v.overridesMaterial = {};
    v.overridesMaterial[itemId] = i.value;
    renderProdutoEditor(el);
  });
  el.querySelectorAll("[data-ov-mat-reset]").forEach((b) => b.onclick = () => {
    const [vIdx, itemId] = b.dataset.ovMatReset.split("|");
    delete draft.variacoes[+vIdx].overridesMaterial[itemId];
    renderProdutoEditor(el);
  });
  el.querySelectorAll("[data-ov-mao]").forEach((i) => i.oninput = () => {
    const [vIdx, itemId] = i.dataset.ovMao.split("|");
    const v = draft.variacoes[+vIdx];
    if (!v.overridesMao) v.overridesMao = {};
    v.overridesMao[itemId] = i.value;
    renderProdutoEditor(el);
  });
  el.querySelectorAll("[data-ov-mao-reset]").forEach((b) => b.onclick = () => {
    const [vIdx, itemId] = b.dataset.ovMaoReset.split("|");
    delete draft.variacoes[+vIdx].overridesMao[itemId];
    renderProdutoEditor(el);
  });

  // --- itens gerais do produto ---
  el.querySelector("#add-mat-geral").onclick = () => {
    if (state.materiais.length === 0) return;
    draft.itensMaterialGerais.push({ id: uidTmp(), materialId: state.materiais[0].id, quantidade: 1 });
    renderProdutoEditor(el);
  };
  el.querySelector("#add-mao-geral").onclick = () => {
    if (state.maoDeObra.length === 0) return;
    draft.itensMaoGerais.push({ id: uidTmp(), itemId: state.maoDeObra[0].id, quantidade: 1 });
    renderProdutoEditor(el);
  };
  el.querySelectorAll("[data-geral='mat'][data-mat-idx]").forEach((s) => s.onchange = () => { draft.itensMaterialGerais[+s.dataset.matIdx].materialId = s.value; renderProdutoEditor(el); });
  el.querySelectorAll("[data-geral='mat'][data-mat-qty]").forEach((i) => i.oninput = () => { draft.itensMaterialGerais[+i.dataset.matQty].quantidade = i.value; renderProdutoEditor(el); });
  el.querySelectorAll("[data-geral='mat'][data-mat-del]").forEach((b) => b.onclick = () => { draft.itensMaterialGerais.splice(+b.dataset.matDel, 1); renderProdutoEditor(el); });
  el.querySelectorAll("[data-geral='mao'][data-mao-idx]").forEach((s) => s.onchange = () => { draft.itensMaoGerais[+s.dataset.maoIdx].itemId = s.value; renderProdutoEditor(el); });
  el.querySelectorAll("[data-geral='mao'][data-mao-qty]").forEach((i) => i.oninput = () => { draft.itensMaoGerais[+i.dataset.maoQty].quantidade = i.value; renderProdutoEditor(el); });
  el.querySelectorAll("[data-geral='mao'][data-mao-del]").forEach((b) => b.onclick = () => { draft.itensMaoGerais.splice(+b.dataset.maoDel, 1); renderProdutoEditor(el); });

  el.querySelector("#prod-salvar").onclick = async () => {
    syncSimple();
    const payload = {
      nome: draft.nome.trim() || "Produto sem nome",
      codigo: (draft.codigo || "").trim(),
      indiretos: numOr0(draft.indiretos),
      itensMaterialGerais: draft.itensMaterialGerais,
      itensMaoGerais: draft.itensMaoGerais,
      variacoes: draft.variacoes.map((v) => ({
        nome: v.nome.trim() || "Tamanho",
        codigo: (v.codigo || "").trim(),
        itensMaterial: v.itensMaterial,
        itensMao: v.itensMao,
        overridesMaterial: v.overridesMaterial || {},
        overridesMao: v.overridesMao || {},
      })),
    };
    if (isNew) await addDoc(colProdutos, payload);
    else await updateDoc(doc(db, "produtos", produtoEditorId), payload);
    produtoEditorId = null; draft = null;
    renderProdutos();
  };

  el.querySelector("#prod-delete")?.addEventListener("click", async () => {
    await deleteDoc(doc(db, "produtos", produtoEditorId));
    produtoEditorId = null; draft = null;
    renderProdutos();
  });

  el.querySelector("#prod-print")?.addEventListener("click", () => { syncSimple(); imprimirProduto(draft); });
}

// ---------- impressão / PDF (via impressão do navegador) ----------
function linhasItens(itensMaterial, itensMao, sufixo) {
  const matRows = (itensMaterial || []).map((it) => {
    const m = state.materiais.find((x) => x.id === it.materialId);
    return `<tr><td>${esc(m?.nome || "?")}${sufixo}</td><td class="num">${it.quantidade} ${esc(m?.unidade || "")}</td><td class="num">${brl(m ? m.custoUnitario * numOr0(it.quantidade) : 0)}</td></tr>`;
  }).join("");
  const maoRows = (itensMao || []).map((it) => {
    const l = state.maoDeObra.find((x) => x.id === it.itemId);
    return `<tr><td>${esc(l?.nome || "?")}${sufixo}</td><td class="num">${it.quantidade} ${esc(l?.unidade || "")}</td><td class="num">${brl(l ? l.valor * numOr0(it.quantidade) : 0)}</td></tr>`;
  }).join("");
  return matRows + maoRows;
}

function imprimirProduto(produto) {
  const linhas = produto.variacoes.map((v) => {
    const c = calcVariacao(produto, v);
    const { mats, maos } = itensGeraisEfetivos(produto, v);
    const gerais = linhasItens(mats, maos, " (geral)");
    const especificos = linhasItens(v.itensMaterial, v.itensMao, "");
    const precosTabela = state.tabelas.map((t) => `<tr><td>${esc(t.nome)}</td><td class="num" colspan="2">${brl(calcPrecoTabela(t, c.total))}</td></tr>`).join("");
    return `
      <div class="print-block">
        <h3 style="font-family:'Fraunces',serif;margin-bottom:8px;">${esc(produto.nome)} — ${esc(v.nome)}${(v.codigo || produto.codigo) ? ` <span style="font-family:'IBM Plex Mono',monospace;font-size:14px;color:#555;">[${esc(v.codigo || produto.codigo)}]</span>` : ""}</h3>
        <table class="print-table">
          <thead><tr><th>Item</th><th class="num">Qtd.</th><th class="num">Subtotal</th></tr></thead>
          <tbody>${gerais}${especificos}</tbody>
        </table>
        <p style="font-size:13px;">
          Custos indiretos (${numOr0(produto.indiretos)}%): ${brl(c.indiretosVal)}<br/>
          <strong>Custo total: ${brl(c.total)}</strong>
        </p>
        ${state.tabelas.length ? `<table class="print-table"><thead><tr><th>Tabela de preço</th><th class="num" colspan="2">Preço</th></tr></thead><tbody>${precosTabela}</tbody></table>` : ""}
      </div>`;
  }).join("");

  const html = `
    <div class="print-title">Plastnova — ${esc(produto.nome)}</div>
    <div class="print-sub">Ficha de custo — gerado em ${new Date().toLocaleDateString("pt-BR")}</div>
    ${linhas}`;
  document.getElementById("print-area").innerHTML = html;
  window.print();
}

function imprimirTabelaGeral() {
  const tabelas = state.tabelas;
  const headerTabelas = tabelas.map((t) => `<th class="num">${esc(t.nome)}</th>`).join("");
  const rows = state.produtos.flatMap((p) =>
    (p.variacoes && p.variacoes.length ? p.variacoes : [{ nome: "—", codigo: "", itensMaterial: [], itensMao: [], overridesMaterial: {}, overridesMao: {} }]).map((v) => {
      const c = calcVariacao(p, v);
      const precos = tabelas.map((t) => `<td class="num">${brl(calcPrecoTabela(t, c.total))}</td>`).join("");
      const codigo = v.codigo || p.codigo || "";
      return `<tr><td>${esc(codigo)}</td><td>${esc(p.nome)}</td><td>${esc(v.nome)}</td><td class="num">${brl(c.total)}</td>${precos}</tr>`;
    })
  ).join("");

  const html = `
    <div class="print-title">Plastnova — Tabela de preços</div>
    <div class="print-sub">Gerado em ${new Date().toLocaleDateString("pt-BR")}</div>
    <table class="print-table">
      <thead><tr><th>Código</th><th>Produto</th><th>Tamanho</th><th class="num">Custo</th>${headerTabelas}</tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
  document.getElementById("print-area").innerHTML = html;
  window.print();
}

// ---------- boot (só roda depois do login) ----------
function iniciarListeners() {
  listen(colMateriais, "materiais", () => {
    if (views.materiais.classList.contains("active")) renderMateriais();
    if (views.produtos.classList.contains("active")) renderProdutos();
  });
  listen(colMaoDeObra, "maoDeObra", () => {
    if (views.maoDeObra.classList.contains("active")) renderMaoDeObra();
    if (views.produtos.classList.contains("active")) renderProdutos();
  });
  listen(colProdutos, "produtos", () => {
    if (views.produtos.classList.contains("active") && produtoEditorId === null) renderProdutos();
  });
  listen(colTabelas, "tabelas", () => {
    if (views.tabelas.classList.contains("active")) renderTabelas();
    if (views.produtos.classList.contains("active")) renderProdutos();
  });

  renderProdutos();
  renderMateriais();
  renderMaoDeObra();
  renderTabelas();
  renderAjustes();
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
