// ============================================================
// Clube de Choro do Brasileirinho - app.js (VERSÃO SUPABASE)
// Migrado do Google Sheets para Supabase SQL
// ============================================================

// ============================================================================
// CONFIGURAÇÃO GLOBAL - SUPABASE
// ============================================================================

/**
 * CONFIGURAÇÃO SUPABASE
 * ONDE PEGAR:
 * No Supabase > Project Settings (engrenagem) > API
 * 1. Project URL -> copie e cole em SUPABASE_URL
 * 2. anon public key -> copie e cole em SUPABASE_KEY
 */
const SUPABASE_URL = "https://tligeoszfzifgqxymoyn.supabase.co"; // ex: https://abcdefgh.supabase.co
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRsaWdlb3N6ZnppZmdxeHltb3luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY5MTU2NTYsImV4cCI6MjEwMjQ5MTY1Nn0.5LhxP0J1ohPaGMqiG1fq91ypPMK8pcG52SzIPoSqc6g"; // começa com eyJ...

/** Mantido por compatibilidade - não usa mais, mas deixa aí */
// const API_RODAS_URL = "https://script.google.com/macros/s/AKfycbzPIbyianh-eI0SMVW1Xj4Qcf6dpYwDIJ_isycG8_FooXVI53Cz4Mo2e9r9VYAORkFJow/exec"; //

/** Lista completa de encontros vinda do Supabase (nunca filtrada) */
let acervoCompleto = [];
/** Lista filtrada que está sendo exibida na tela agora */
let acervoFiltradoAtual = [];
/** Objeto que guarda as instâncias dos gráficos Chart.js */
let graficosAtivos = {};

        // ============================================================================
        // FUNÇÕES UTILITÁRIAS
        // ============================================================================

        /**
         * FUNÇÃO: normalizarTexto(str)
         * O QUE FAZ: Remove acentos e deixa minúsculo para busca funcionar sem se preocupar com acento
         * Ex: "João" vira "joao", "cavaquinho" continua "cavaquinho"
         * @param {string} str - texto qualquer
         * @returns {string} texto sem acento e minúsculo
         * ONDE MEXER: Se quiser busca exata com acento, remova o .normalize()
         */
        function normalizarTexto(str) {
            if (!str) return "";
            return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
        }

        /**
         * Variável global para controlar o debounce (evitar filtrar a cada letra digitada)
         */
        let temporizadorBusca;

        /**
         * FUNÇÃO: agendarFiltragem(inputId)
         * O QUE FAZ: Espera 300ms depois que o usuário parar de digitar para aplicar filtro
         * Isso evita travar a tela filtrando a cada tecla
         * Também mostra/esconde o botão X de limpar
         * @param {string} inputId - id do input (ex: 'filtro-busca')
         * ONDE MEXER: Mude o tempo 300 para 100 (mais rápido) ou 600 (mais lento)
         */
        function agendarFiltragem(inputId) {
            const inputVal = document.getElementById(inputId).value;
            const btnClear = document.getElementById('clear-' + inputId);
            if (inputVal.length > 0) {
                btnClear.classList.remove('hidden');
            } else {
                btnClear.classList.add('hidden');
            }

            clearTimeout(temporizadorBusca);
            temporizadorBusca = setTimeout(() => {
                filtrarAcervo();
            }, 300);
        }

        /**
         * FUNÇÃO: limparCampoFiltro(inputId)
         * O QUE FAZ: Limpa o campo de texto e reaplica os filtros
         * @param {string} inputId - id do input para limpar
         */
        function limparCampoFiltro(inputId) {
            document.getElementById(inputId).value = '';
            document.getElementById('clear-' + inputId).classList.add('hidden');
            filtrarAcervo();
        }

        /**
         * FUNÇÃO: formatarDataBR(dataStr)
         * O QUE FAZ: Transforma datas feias que vem da planilha em formato brasileiro DD/MM/AAAA
         * Suporta formatos: ISO com T (2024-05-10T00:00:00) e formato com barra
         * @param {string} dataStr - data bruta da planilha
         * @returns {string} data formatada ou "Sem data"
         * ONDE MEXER: Se quiser formato AAAA-MM-DD, mude o return final
         */
        function formatarDataBR(dataStr) {
            if (!dataStr) return "Sem data";
            if (dataStr.includes('T') && dataStr.includes('/')) {
                const partes = dataStr.split('/');
                return `${partes[0].split('T')[0].padStart(2, '0')}/${partes[1].padStart(2, '0')}/${partes[2]}`;
            }
            if (dataStr.includes('-')) {
                const partes = dataStr.split('T')[0].split('-');
                return `${partes[2]}/${partes[1]}/${partes[0]}`;
            }
            return dataStr;
        }

        // ============================================================================
        // FUNÇÕES DE INTERFACE (TABS E MODO ESCURO)
        // ============================================================================

        /**
         * FUNÇÃO: trocarAba(tabId)
         * O QUE FAZ: Troca entre as abas "Encontros & Filtros" e "Painel & Estatísticas"
         * Esconde todas as abas e mostra só a escolhida
         * @param {string} tabId - 'consulta-tab' ou 'dashboard-tab'
         */
        function trocarAba(tabId) {
            document.querySelectorAll('.tab-content').forEach(el => el.classList.replace('block', 'hidden'));
            document.getElementById(tabId).classList.replace('hidden', 'block');
            
            document.querySelectorAll('.tab-btn').forEach(el => el.className = "flex-1 py-2.5 px-4 rounded-full text-sm font-bold text-stone-600 hover:text-stone-400 transition-all cursor-pointer tab-btn");
            const activeBtn = tabId === 'consulta-tab' ? 'btn-consulta' : 'btn-dashboard';
            document.getElementById(activeBtn).className = "flex-1 py-2.5 px-4 rounded-full text-sm font-bold text-emerald-900 bg-white shadow-xs transition-all cursor-pointer tab-btn";
        }

        /**
         * FUNÇÃO: alternarVisaoDoPainel(visao)
         * O QUE FAZ: Dentro do dashboard, alterna entre Visão Rápida (mini rankings) e Gráficos Avançados
         * @param {string} visao - 'mini' ou 'avancada'
         * ONDE MEXER: Se quiser criar terceira visão, adicione novo if
         */
        function alternarVisaoDoPainel(visao) {
            const painelMini = document.getElementById('dash-visao-mini');
            const painelAvancado = document.getElementById('dash-visao-avancada');
            const btnMini = document.getElementById('sub-btn-mini');
            const btnAvancado = document.getElementById('sub-btn-avancada');

            if (visao === 'mini') {
                painelMini.classList.remove('hidden');
                painelAvancado.classList.add('hidden');
                btnMini.className = "flex-1 py-1.5 px-3 text-xs font-black rounded-lg transition-all bg-white text-emerald-950 shadow-2xs cursor-pointer";
                btnAvancado.className = "flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all text-stone-500 hover:text-stone-400 cursor-pointer";
            } else {
                painelMini.classList.add('hidden');
                painelAvancado.classList.remove('hidden');
                btnMini.className = "flex-1 py-1.5 px-3 text-xs font-bold rounded-lg transition-all text-stone-500 hover:text-stone-400 cursor-pointer";
                btnAvancado.className = "flex-1 py-1.5 px-3 text-xs font-black rounded-lg transition-all bg-white text-emerald-950 shadow-2xs cursor-pointer";
            }
        }

        /**
         * FUNÇÃO: alternarModoNoturno()
         * O QUE FAZ: Liga/desliga modo escuro (Roda Noturna) e salva preferência no localStorage
         * Muda classe no body e ícone 🌙/☀️
         * ONDE MEXER: Se quiser mudar cores do modo noturno, edite o CSS lá em cima em body.dark-mode
         */
        function alternarModoNoturno() {
            const body = document.getElementById('body-app');
            const icone = document.getElementById('dark-mode-icon');
            
            if (body.classList.contains('dark-mode')) {
                body.classList.remove('dark-mode');
                icone.innerText = "🌙";
                localStorage.setItem('brasileirinho_theme', 'light');
            } else {
                body.classList.add('dark-mode');
                icone.innerText = "☀️";
                localStorage.setItem('brasileirinho_theme', 'dark');
            }
        }

        /**
         * FUNÇÃO: aplicarAtalhoFiltro(valor, tipo)
         * O QUE FAZ: Quando clica nos atalhos (Percussão, Clarinete...), preenche o filtro automaticamente
         * @param {string} valor - texto do chip (ex: 'Percussão')
         * @param {string} tipo - 'inst' para instrumento, 'busca' para busca geral
         */
        function aplicarAtalhoFiltro(valor, tipo) {
            if (tipo === 'inst') {
                document.getElementById('filtro-instrumento').value = valor;
                document.getElementById('clear-filtro-instrumento').classList.remove('hidden');
            } else {
                document.getElementById('filtro-busca').value = valor;
                document.getElementById('clear-filtro-busca').classList.remove('hidden');
            }
            filtrarAcervo();
        }

        /**
         * FUNÇÃO: filtrarPorMusicoClicado(nome)
         * O QUE FAZ: Quando clica no nome de um musicista no histórico, filtra tudo por ele
         * Volta para aba de consulta automaticamente
         * @param {string} nome - nome do músico clicado
         */
        function filtrarPorMusicoClicado(nome) {
            document.getElementById('filtro-busca').value = nome;
            document.getElementById('clear-filtro-busca').classList.remove('hidden');
            trocarAba('consulta-tab');
            filtrarAcervo();
            window.scrollTo({ top: 150, behavior: 'smooth' });
        }

        // ============================================================================
        // FUNÇÕES DE RENDERIZAÇÃO E FILTROS (CORAÇÃO DO APP)
        // ============================================================================

        /**
         * FUNÇÃO: renderizarListaDeRodas(rodas, buscaOriginal, instrumentoOriginal)
         * O QUE FAZ: É a função mais importante - desenha na tela todos os encontros filtrados
         * Cria os acordeões (botão + painel escondido) para cada roda
         * Também filtra internamente músicos e músicas para mostrar só o que bate com a busca
         * @param {Array} rodas - lista de encontros já filtrada
         * @param {string} buscaOriginal - texto original da busca geral (para destacar)
         * @param {string} instrumentoOriginal - texto original do filtro instrumento
         * ONDE MEXER: 
         * - Para mudar o layout do card, edite o btn.innerHTML e panel.innerHTML
         * - Para adicionar link de áudio diferente, mude o linkAudio (hoje é YouTube)
         */
        function renderizarListaDeRodas(rodas, buscaOriginal = '', instrumentoOriginal = '') {
            const container = document.getElementById('historico-lista');
            
            // Caso não encontrou nada
            if (rodas.length === 0) {
                container.innerHTML = `
                    <div class="text-center py-10 bg-stone-50 dark:bg-stone-900/40 rounded-xl border border-dashed border-stone-200 dark:border-stone-800">
                        <span class="text-5xl mb-3 block">🏜️</span>
                        <h3 class="text-lg font-black text-stone-700 dark:text-stone-300 mb-1">Nenhum choro encontrado!</h3>
                        <p class="text-sm text-stone-500 mb-5">O nosso acervo ainda não tem registros que batam com essa pesquisa.</p>
                        <button onclick="resetarFiltros()" class="bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 px-5 py-2.5 rounded-full font-bold text-sm hover:scale-105 transition cursor-pointer">
                            ↻ Limpar Filtros
                        </button>
                    </div>
                `;
                return;
            }
            container.innerHTML = '';
            
            const buscaNormalizada = normalizarTexto(buscaOriginal);
            const instNormalizado = normalizarTexto(instrumentoOriginal);
            
            rodas.forEach(r => {
                // Os dados vem da planilha no formato "Nome1 | Nome2 | Nome3"
                const nomes = r.musicosNomes ? r.musicosNomes.split(' | ') : [];
                const insts = r.musicosInst ? r.musicosInst.split(' | ') : [];
                const musicas = r.repMusicas ? r.repMusicas.split(' | ') : [];
                const comps = r.repComps ? r.repComps.split(' | ') : [];

                // Monta lista de músicos que batem com filtro
                let musicosHtml = [];
                nomes.forEach((n, i) => {
                    if (!n.trim()) return;
                    const inst = insts[i] || '?';
                    
                    const strComparacao = normalizarTexto(`${n} ${inst}`);
                    const atendeBusca = buscaNormalizada ? strComparacao.includes(buscaNormalizada) : true;
                    const atendeInst = instNormalizado ? normalizarTexto(inst).includes(instNormalizado) : true;
                    
                    // Exibe apenas os músicos que batem com os filtros ativos
                    if (atendeBusca && atendeInst) {
                        const tagMusico = `<span onclick="filtrarPorMusicoClicado('${n.trim().replace(/'/g, "\\'")}')" class="cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline font-semibold transition-colors" title="Ver histórico deste músico">${n}</span>`;
                        musicosHtml.push(`<li>• ${tagMusico} <span class="text-stone-400 text-xs">(${inst})</span></li>`);
                    }
                });

                // Se houveram músicos, mas todos foram ocultados pelo filtro
                if (musicosHtml.length === 0 && nomes.length > 0) {
                    musicosHtml.push(`<li><span class="text-stone-400 text-[11px] italic">...outros músicos ocultados pelo filtro</span></li>`);
                }

                // Monta lista de músicas que batem com filtro
                let musicasHtml = [];
                musicas.forEach((m, i) => {
                    if (!m.trim()) return;
                    const comp = comps[i] || 'Domínio Público';
                    
                    const strComparacao = normalizarTexto(`${m} ${comp}`);
                    const atendeBusca = buscaNormalizada ? strComparacao.includes(buscaNormalizada) : true;
                    
                    if (atendeBusca) {
                        const linkAudio = `https://www.youtube.com/results?search_query=Choro+${encodeURIComponent(m.trim())}+${encodeURIComponent(comp.trim())}`;
                        const tagMusica = `<a href="${linkAudio}" target="_blank" class="hover:text-emerald-700 dark:hover:text-emerald-400 hover:underline inline-flex items-center gap-1" title="Procurar gravação no YouTube">"${m}" <span class="text-[10px] opacity-60">↗️</span></a>`;
                        musicasHtml.push(`<li>• ${tagMusica} <span class="text-stone-400 text-xs">— ${comp}</span></li>`);
                    }
                });

                if (musicasHtml.length === 0 && musicas.length > 0) {
                    musicasHtml.push(`<li><span class="text-stone-400 text-[11px] italic">...repertório ocultado pelo filtro</span></li>`);
                }

                // Cria botão do acordeão
                const btn = document.createElement('button');
                btn.className = "w-full text-left font-bold text-stone-700 bg-stone-100 hover:bg-stone-200 p-3.5 rounded-xl outline-none flex justify-between items-center transition cursor-pointer";
                btn.innerHTML = `<span>Encontro #${r.encontroNumero} — <span class="text-stone-500 font-medium">${formatarDataBR(r.data)}</span></span><span class="text-xs bg-white text-stone-500 px-2 py-1 rounded-md shadow-2xs">Ver ▾</span>`;

                // Cria painel escondido do acordeão
                const panel = document.createElement('div');
                panel.className = "accordion-content bg-white border-x border-b border-stone-100 rounded-b-xl px-4";
                panel.innerHTML = `
                    <div class="py-4 text-sm space-y-3">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div><strong class="text-emerald-800 dark:text-emerald-400 text-xs uppercase tracking-wider block mb-1">Musicistas na Roda</strong><ul class="space-y-1 text-stone-600">${musicosHtml.join('')}</ul></div>
                            <div><strong class="text-amber-700 dark:text-amber-400 text-xs uppercase tracking-wider block mb-1">Choros Tocados</strong><ul class="space-y-1 text-stone-600">${musicasHtml.join('')}</ul></div>
                        </div>
                        ${r.observacoes ? `<div class="bg-stone-50 dark:bg-stone-900/60 p-2.5 rounded-lg text-xs text-stone-600"><strong>Nota:</strong> ${r.observacoes}</div>` : ''}
                    </div>
                `;

                // Clique abre/fecha acordeão
                btn.addEventListener('click', function() {
                    if (panel.style.maxHeight) panel.style.maxHeight = null;
                    else panel.style.maxHeight = panel.scrollHeight + "px";
                });

                container.appendChild(btn);
                container.appendChild(panel);
            });
        }

        /**
         * FUNÇÃO: filtrarAcervo()
         * O QUE FAZ: Filtra acervoCompleto com base nos 4 inputs (busca, instrumento, data inicio, data fim)
         * Também atualiza a URL para poder compartilhar link com filtro (?busca=João&inst=Cavaquinho)
         * No final chama renderizarListaDeRodas e recalcularEstatisticas
         * ONDE MEXER: Se quiser novo tipo de filtro, adicione novo if dentro do .filter()
         */
        function filtrarAcervo() {
            const buscaOriginal = document.getElementById('filtro-busca').value.trim();
            const instrumentoOriginal = document.getElementById('filtro-instrumento').value.trim();
            
            const busca = normalizarTexto(buscaOriginal);
            const instrumento = normalizarTexto(instrumentoOriginal);
            
            const dataInicio = document.getElementById('filtro-data-inicio').value;
            const dataFim = document.getElementById('filtro-data-fim').value;

            // Atualiza URL para compartilhamento
            const urlParams = new URLSearchParams();
            if (buscaOriginal) urlParams.set('busca', buscaOriginal);
            if (instrumentoOriginal) urlParams.set('inst', instrumentoOriginal);
            if (dataInicio) urlParams.set('inicio', dataInicio);
            if (dataFim) urlParams.set('fim', dataFim);
            const stringUrl = urlParams.toString() ? '?' + urlParams.toString() : window.location.pathname;
            window.history.replaceState({}, '', stringUrl);

            // Filtragem real
            acervoFiltradoAtual = acervoCompleto.filter(r => {
                if (busca) {
                    const corpoTexto = normalizarTexto([r.encontroNumero, r.musicosNomes, r.repMusicas, r.repComps, r.observacoes].join(' '));
                    if (!corpoTexto.includes(busca)) return false;
                }
                if (instrumento) {
                    const instrumentosTexto = normalizarTexto(r.musicosInst || '');
                    if (!instrumentosTexto.includes(instrumento)) return false;
                }
                if (r.data) {
                    const dataFormatada = r.data.split('T')[0];
                    if (dataInicio && dataFormatada < dataInicio) return false;
                    if (dataFim && dataFormatada > dataFim) return false;
                } else if (dataInicio || dataFim) {
                    return false;
                }
                return true;
            });
            
            const badge = document.getElementById('badge-filtros');
            const txtContador = document.getElementById('texto-contador-registros');
            const txtAvisoDash = document.getElementById('txt-filtro-aviso-dash');

            if (busca || instrumento || dataInicio || dataFim) {
                badge.classList.remove('hidden');
                txtAvisoDash.classList.remove('hidden');
                txtContador.innerHTML = `Filtrado: Localizados <strong>${acervoFiltradoAtual.length}</strong> de <strong>${acervoCompleto.length}</strong> encontros.`;
            } else {
                badge.classList.add('hidden');
                txtAvisoDash.classList.add('hidden');
                txtContador.innerHTML = `Total estável de <strong>${acervoCompleto.length}</strong> encontros carregados.`;
            }

            renderizarListaDeRodas(acervoFiltradoAtual, buscaOriginal, instrumentoOriginal);
            recalcularEstatisticas(acervoFiltradoAtual);
        }

        /**
         * FUNÇÃO: resetarFiltros()
         * O QUE FAZ: Limpa todos os inputs e reseta para mostrar tudo
         */
        function resetarFiltros() {
            document.getElementById('filtro-busca').value = '';
            document.getElementById('filtro-instrumento').value = '';
            document.getElementById('filtro-data-inicio').value = '';
            document.getElementById('filtro-data-fim').value = '';
            
            document.getElementById('clear-filtro-busca').classList.add('hidden');
            document.getElementById('clear-filtro-instrumento').classList.add('hidden');
            
            filtrarAcervo();
        }

        /**
         * FUNÇÃO: exportarCSVFiltrado()
         * O QUE FAZ: Pega a lista filtrada atual e baixa um arquivo CSV (abre no Excel)
         * ONDE MEXER: Se quiser mudar separador, troque o ; por , 
         * Se quiser adicionar coluna, adicione no cabeçalho e no array linha
         */
        function exportarCSVFiltrado() {
            if (acervoFiltradoAtual.length === 0) return;
            
            let conteudoCsv = "data:text/csv;charset=utf-8,";
            conteudoCsv += "Encontro;Data;Musicistas;Instrumentos;Choros;Compositores;Observacoes\n";
            
            acervoFiltradoAtual.forEach(r => {
                const linha = [
                    r.encontroNumero,
                    formatarDataBR(r.data),
                    (r.musicosNomes || '').replace(/;/g, ','),
                    (r.musicosInst || '').replace(/;/g, ','),
                    (r.repMusicas || '').replace(/;/g, ','),
                    (r.repComps || '').replace(/;/g, ','),
                    (r.observacoes || '').replace(/;/g, ',')
                ].join(";");
                conteudoCsv += linha + "\n";
            });
            
            const linkCodificado = encodeURI(conteudoCsv);
            const linkElemento = document.createElement("a");
            linkElemento.setAttribute("href", linkCodificado);
            linkElemento.setAttribute("download", `Clube_Choro_Filtrado_${new Date().toISOString().slice(0,10)}.csv`);
            document.body.appendChild(linkElemento);
            linkElemento.click();
            document.body.removeChild(linkElemento);
        }

        /**
         * FUNÇÃO: desenharBarraRanking(containerId, listaItens, corBarra, sufixo)
         * O QUE FAZ: Desenha as barrinhas de ranking da Visão Rápida (ex: Top 4 músicas)
         * @param {string} containerId - id da div onde vai desenhar
         * @param {Array} listaItens - array tipo [['Carinhoso', 5], ['Brasileirinho', 3]]
         * @param {string} corBarra - classe Tailwind da cor (bg-emerald-600)
         * @param {string} sufixo - '×' ou ' m.' etc
         */
        function desenharBarraRanking(containerId, listaItens, corBarra, sufixo = '×') {
            const container = document.getElementById(containerId);
            if (listaItens.length === 0) {
                container.innerHTML = '<p class="text-xs text-stone-400 italic">Nenhum dado.</p>';
                return;
            }
            const maiorValor = listaItens[0][1];
            container.innerHTML = listaItens.map(([nome, total]) => {
                const percentual = maiorValor > 0 ? (total / maiorValor) * 100 : 0;
                return `
                    <div class="space-y-0.5">
                        <div class="flex justify-between text-xs font-bold text-stone-600">
                            <span class="truncate max-w-[150px]" title="${nome}">${nome}</span>
                            <span class="text-stone-900">${total}${sufixo}</span>
                        </div>
                        <div class="w-full bg-stone-100 dark:bg-stone-800 rounded-full h-2">
                            <div class="${corBarra} h-2 rounded-full transition-all duration-500" style="width: ${percentual}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
        }

        /**
         * FUNÇÃO: desenharGraficosAvancados(...)
         * O QUE FAZ: Cria os 4 gráficos do Chart.js (linha, barras, doughnut)
         * Sempre destrói gráficos antigos antes para não duplicar
         * @param {Array} dadosEvolucao - [{label: '#1', valor: 5}, ...]
         * @param {Array} dadosMusicas - [['Musica', qtd], ...]
         * @param {Array} dadosCompositores - [['Pixinguinha', qtd], ...]
         * @param {Array} dadosInstrumentos - [['Cavaquinho', qtd], ...]
         * ONDE MEXER: Para mudar cor, edite backgroundColor e borderColor
         */
        function desenharGraficosAvancados(dadosEvolucao, dadosMusicas, dadosCompositores, dadosInstrumentos) {
            Object.values(graficosAtivos).forEach(chart => chart.destroy());

            const opcoesPadrao = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } };

            graficosAtivos.evolucao = new Chart(document.getElementById('chart-evolucao-presenca'), {
                type: 'line',
                data: {
                    labels: dadosEvolucao.map(d => d.label),
                    datasets: [{ label: 'Musicistas', data: dadosEvolucao.map(d => d.valor), borderColor: '#047857', backgroundColor: 'rgba(4, 120, 87, 0.1)', borderWidth: 3, fill: true, tension: 0.2 }]
                },
                options: { ...opcoesPadrao, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
            });

            graficosAtivos.musicas = new Chart(document.getElementById('chart-top-musicas'), {
                type: 'bar',
                data: {
                    labels: dadosMusicas.map(d => d[0]),
                    datasets: [{ data: dadosMusicas.map(d => d[1]), backgroundColor: '#047857', borderRadius: 6 }]
                },
                options: { ...opcoesPadrao, indexAxis: 'y', scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } } }
            });

            graficosAtivos.compositores = new Chart(document.getElementById('chart-top-compositores'), {
                type: 'bar',
                data: {
                    labels: dadosCompositores.map(d => d[0]),
                    datasets: [{ data: dadosCompositores.map(d => d[1]), backgroundColor: '#f59e0b', borderRadius: 6 }]
                },
                options: { ...opcoesPadrao, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
            });

            graficosAtivos.instrumentos = new Chart(document.getElementById('chart-mix-instrumentos'), {
                type: 'doughnut',
                data: {
                    labels: dadosInstrumentos.map(d => d[0]),
                    datasets: [{
                        data: dadosInstrumentos.map(d => d[1]),
                        backgroundColor: ['#047857', '#f59e0b', '#78716c', '#10b981', '#f59e0b', '#a8a29e', '#065f46']
                    }]
                },
                options: { ...opcoesPadrao, plugins: { legend: { display: true, position: 'right', labels: { boxWidth: 12, font: { size: 10 } } } } }
            });
        }

        /**
         * FUNÇÃO: recalcularEstatisticas(listaRodas)
         * O QUE FAZ: Calcula todas as estatísticas do dashboard
         * Conta músicas, compositores, instrumentos, dias mais cheios, recorde de presença
         * Usa Set para contar músicos únicos (sem repetir nomes)
         * No final chama desenharBarraRanking e desenharGraficosAvancados
         * @param {Array} listaRodas - lista filtrada de rodas
         * ONDE MEXER: Se quiser contar algo novo (ex: média de músicos por roda), adicione aqui
         */
        function recalcularEstatisticas(listaRodas) {
            let contagemMusicas = {};
            let contagemCompositores = {};
            let contagemInstrumentos = {};
            let contagemDiasCheios = [];
            let dadosEvolucaoCronologica = [];
            let totalMusicosUnicos = new Set();
            let acumuladorMusicas = 0;
            let maxMusicosContagem = 0;
            let dataRecordeMúsicos = "Sem registros";

            const rodasOrdenadas = [...listaRodas].sort((a,b) => Number(a.encontroNumero) - Number(b.encontroNumero));

            rodasOrdenadas.forEach(r => {
                const nomes = r.musicosNomes ? r.musicosNomes.split(' | ') : [];
                const insts = r.musicosInst ? r.musicosInst.split(' | ') : [];
                const musicas = r.repMusicas ? r.repMusicas.split(' | ') : [];
                const comps = r.repComps ? r.repComps.split(' | ') : [];

                const totalMusicosDessaRoda = nomes.filter(n => n.trim() !== '').length;
                
                if (totalMusicosDessaRoda > maxMusicosContagem) {
                    maxMusicosContagem = totalMusicosDessaRoda;
                    dataRecordeMúsicos = `${formatarDataBR(r.data)} (${totalMusicosDessaRoda} Musicistas)`;
                }

                if (totalMusicosDessaRoda > 0) {
                    contagemDiasCheios.push([`Encontro #${r.encontroNumero}`, totalMusicosDessaRoda]);
                    dadosEvolucaoCronologica.push({ label: `#${r.encontroNumero}`, valor: totalMusicosDessaRoda });
                }

                nomes.forEach((n, i) => {
                    const nomeLimpo = n.trim();
                    if(nomeLimpo) {
                        const nomeNormalizado = nomeLimpo.toLowerCase().split(' ').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
                        totalMusicosUnicos.add(nomeNormalizado);
                    }
                    const instLimpo = insts[i] ? insts[i].trim() : '';
                    if(instLimpo) contagemInstrumentos[instLimpo] = (contagemInstrumentos[instLimpo] || 0) + 1;
                });

                musicas.forEach((m, i) => {
                    const musicaLimpa = m.trim();
                    if(musicaLimpa) {
                        acumuladorMusicas++;
                        contagemMusicas[musicaLimpa] = (contagemMusicas[musicaLimpa] || 0) + 1;
                    }
                    const compLimpo = comps[i] ? comps[i].trim() : '';
                    if(compLimpo) contagemCompositores[compLimpo] = (contagemCompositores[compLimpo] || 0) + 1;
                });
            });

            document.getElementById('dash-total-rodas').innerText = listaRodas.length;
            document.getElementById('dash-total-musicos').innerText = totalMusicosUnicos.size;
            document.getElementById('dash-total-musicas').innerText = acumuladorMusicas;
            document.getElementById('chart-val-pico-musicos').innerText = dataRecordeMúsicos;

            const topMusicasMini = Object.entries(contagemMusicas).sort((a,b) => b[1] - a[1]).slice(0, 4);
            const topCompositoresMini = Object.entries(contagemCompositores).sort((a,b) => b[1] - a[1]).slice(0, 4);
            const topDiasCheiosMini = [...contagemDiasCheios].sort((a, b) => b[1] - a[1]).slice(0, 4);

            desenharBarraRanking('ranking-musicas', topMusicasMini, 'bg-emerald-600');
            desenharBarraRanking('ranking-compositores', topCompositoresMini, 'bg-amber-500');
            desenharBarraRanking('ranking-dias-cheios', topDiasCheiosMini, 'bg-stone-500', ' m.');

            const topMusicasGrafico = Object.entries(contagemMusicas).sort((a,b) => b[1] - a[1]).slice(0, 10);
            const topCompositoresGrafico = Object.entries(contagemCompositores).sort((a,b) => b[1] - a[1]).slice(0, 10);
            const mixInstrumentosGrafico = Object.entries(contagemInstrumentos).sort((a,b) => b[1] - a[1]).slice(0, 7);

            desenharGraficosAvancados(dadosEvolucaoCronologica, topMusicasGrafico, topCompositoresGrafico, mixInstrumentosGrafico);
        }

        /**
         * FUNÇÃO NOVA: transformarLinhaSupabaseParaApp(row)
         * O QUE FAZ: Converte coluna do Supabase (snake_case) para o formato que seu app já usa (camelCase)
         * Ex: musicos_nomes -> musicosNomes, encontro_numero -> encontroNumero
         * Isso evita ter que reescrever todo o resto do código
         */
        function transformarLinhaSupabaseParaApp(row) {
            return {
                encontroNumero: row.encontro_numero,
                data: row.data, // já vem como 2024-05-10 do tipo DATE
                musicosNomes: row.musicos_nomes,
                musicosInst: row.musicos_inst,
                repMusicas: row.rep_musicas,
                repComps: row.rep_comps,
                observacoes: row.observacoes
            };
        }

        /**
         * FUNÇÃO NOVA: carregarDadosDoSupabase()
         * O QUE FAZ: Busca os dados direto do Supabase SQL
         * É a substituta da carregarDadosDaPlanilha()
         * Salva no localStorage como cache igual antes
         */
        function carregarDadosDoSupabase() {
            // Se você ainda não colou sua URL/KEY, avisa no console e tenta usar cache
            if (SUPABASE_URL.includes("COLE_AQUI")) {
                console.warn("⚠️ Você ainda não configurou SUPABASE_URL e SUPABASE_KEY no topo do app.js");
                const cacheLocal = localStorage.getItem('brasileirinho_data_cache');
                if (cacheLocal) {
                    acervoCompleto = JSON.parse(cacheLocal);
                    lerFiltrosDaURL();
                }
                return;
            }

            fetch(`${SUPABASE_URL}/rest/v1/rodas?select=*&order=data.asc`, {
                headers: {
                    "apikey": SUPABASE_KEY,
                    "Authorization": `Bearer ${SUPABASE_KEY}`
                }
            })
            .then(res => {
                if (!res.ok) throw new Error(`Supabase retornou ${res.status}`);
                return res.json();
            })
            .then(rows => {
                if (!rows || rows.length === 0) {
                    console.warn("Supabase retornou vazio");
                    return;
                }
                // Converte cada linha do Supabase para o formato do app
                const dadosConvertidos = rows.map(transformarLinhaSupabaseParaApp);
                
                acervoCompleto = dadosConvertidos;
                localStorage.setItem('brasileirinho_data_cache', JSON.stringify(dadosConvertidos));
                console.log(`✅ ${dadosConvertidos.length} rodas carregadas do Supabase`);
                lerFiltrosDaURL();
            })
            .catch(err => {
                console.error("Erro ao buscar no Supabase, usando cache:", err);
                const txtContador = document.getElementById('texto-contador-registros');
                if (txtContador) {
                    txtContador.innerHTML = `⚠️ Modo Offline (Cache local). Erro: ${err.message}`;
                }
                // Tenta cache mesmo com erro
                const cacheLocal = localStorage.getItem('brasileirinho_data_cache');
                if (cacheLocal) {
                    acervoCompleto = JSON.parse(cacheLocal);
                    lerFiltrosDaURL();
                }
            });
        }

        // Mantém nome antigo por compatibilidade - chama a nova
        function carregarDadosDaPlanilha() {
            return carregarDadosDoSupabase();
        }

        /**
         * FUNÇÃO: lerFiltrosDaURL()
         * O QUE FAZ: Quando a página abre, lê os parâmetros da URL (?busca=...&inst=...) e já preenche os filtros
         * Isso permite compartilhar link filtrado: ex: seu-site.com?busca=João&inst=Cavaquinho
         */
        function lerFiltrosDaURL() {
            const params = new URLSearchParams(window.location.search);
            let temFiltroNaUrl = false;

            if (params.get('busca')) {
                document.getElementById('filtro-busca').value = params.get('busca');
                document.getElementById('clear-filtro-busca').classList.remove('hidden');
                temFiltroNaUrl = true;
            }
            if (params.get('inst')) {
                document.getElementById('filtro-instrumento').value = params.get('inst');
                document.getElementById('clear-filtro-instrumento').classList.remove('hidden');
                temFiltroNaUrl = true;
            }
            if (params.get('inicio')) {
                document.getElementById('filtro-data-inicio').value = params.get('inicio');
                temFiltroNaUrl = true;
            }
            if (params.get('fim')) {
                document.getElementById('filtro-data-fim').value = params.get('fim');
                temFiltroNaUrl = true;
            }

            filtrarAcervo();
        }

        /**
         * EVENTO: window.onload
         * O QUE FAZ: Roda assim que a página termina de carregar
         * 1. Verifica tema salvo (claro/escuro) e aplica
         * 2. Tenta carregar cache local do localStorage para mostrar algo rápido
         * 3. Depois busca dados novos da planilha (carregarDadosDaPlanilha)
         * Isso faz o site abrir rápido mesmo sem internet
         */
        window.onload = function() {
            const temaSalvo = localStorage.getItem('brasileirinho_theme');
            if (temaSalvo === 'dark') alternarModoNoturno();

            const cacheLocal = localStorage.getItem('brasileirinho_data_cache');
            if (cacheLocal) {
                acervoCompleto = JSON.parse(cacheLocal);
                document.getElementById('texto-contador-registros').innerHTML = `Carregando cache local...`;
                lerFiltrosDaURL();
            }

            carregarDadosDoSupabase();
        };


// ============================================================
// ALIASES DE COMPATIBILIDADE (para HTML antigo ainda funcionar)
// Pode remover depois que atualizar o index.html
// ============================================================
const removerAcentos = normalizarTexto;
const limparDataHistorico = formatarDataBR;
const switchTab = trocarAba;
const toggleDarkMode = alternarModoNoturno;
