import { db } from './firebase.js';
import { 
    collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, limit 
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let produtos = [];
let categorias = [];
let adicionais = [];
let configuracoes = { bairros: [], metodos: [] };

let cart = JSON.parse(localStorage.getItem('casaDoPastelCart')) || [];
let currentProduct = null;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    setupScrollReveal(); // Inicia as animações primeiro para garantir que o conteúdo apareça

    // Conectar ao Banco de Dados
    const isMenuPage = !!document.querySelector('.categories');

    if (isMenuPage) {
        ouvirCategoriasAtivas(setCategorias);
        ouvirProdutosAtivos(setProdutos);
    } else {
        // Na Home, buscamos apenas os 3 primeiros para a seção de Destaques
        ouvirDestaquesAutomaticos(setProdutos);
    }

    ouvirAdicionais(setAdicionais);
    buscarConfiguracoes();

    checkStoreStatus();
    updateCartUI();

    // Toggle visibility of address section based on order type
    document.querySelectorAll('input[name="order-type"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const addrSection = document.getElementById('address-section');
            const timeEstimate = document.getElementById('estimated-time');
            addrSection.style.display = e.target.value === 'delivery' ? 'block' : 'none';
            
            if (timeEstimate) {
                timeEstimate.innerText = e.target.value === 'delivery' 
                    ? 'Tempo médio de entrega: 30-50 min' 
                    : 'Tempo médio de retirada: 15-20 min';
            }
            updateCartUI(); // Recalcula o total ao mudar o tipo
        });
    });

    // Toggle visibility of change input based on payment method
    document.querySelectorAll('input[name="payment-method"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const changeSection = document.getElementById('change-section');
            if (changeSection) changeSection.style.display = e.target.value === 'dinheiro' ? 'block' : 'none';
        });
    });

    // Recalcula o total ao mudar o bairro
    const neighborhoodSelect = document.getElementById('neighborhood-select');
    if (neighborhoodSelect) neighborhoodSelect.addEventListener('change', updateCartUI);

    // Fechar menu mobile ao clicar em um link
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.addEventListener('click', () => {
            const navLinks = document.querySelector('.nav-links');
            if (navLinks.classList.contains('active')) {
                toggleMobileMenu();
            }
        });
    });

    // Máscara de Telefone (xx) xxxxx-xxxx
    const phoneInput = document.getElementById('client-phone');
    if (phoneInput) {
        phoneInput.addEventListener('input', (e) => {
            let value = e.target.value.replace(/\D/g, "");
            value = value.replace(/^(\d{2})(\d)/g, "($1) $2");
            value = value.replace(/(\d{5})(\d)/, "$1-$2");
            e.target.value = value.substring(0, 15);
        });
    }
});

// --- Funções Firebase ---

function ouvirCategoriasAtivas(callback) {
    console.log("Buscando categorias...");
    const q = query(collection(db, 'categorias'), orderBy('ordem', 'asc'));
    onSnapshot(q, (snapshot) => {
        const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Categorias recebidas:", cats);
        callback(cats);
    });
}

function ouvirAdicionais(callback) {
    console.log("Buscando adicionais...");
    const q = query(collection(db, 'adicionais'));
    onSnapshot(q, (snapshot) => {
        const ads = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Adicionais recebidos:", ads);
        callback(ads);
    });
}

function ouvirProdutosAtivos(callback) {
    console.log("Buscando produtos...");
    // Busca apenas onde status é a string "ativo" (conforme salvo no banco)
    const q = query(collection(db, 'produtos'), where("status", "==", "ativo"));
    
    return onSnapshot(q, (snapshot) => {
        const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Produtos recebidos do Firebase:", prods);
        callback(prods);
    }, error => {
        console.error("Erro Firebase Produtos:", error);
    });
}

function ouvirDestaquesAutomaticos(callback) {
    console.log("Buscando 3 destaques automáticos...");
    // Removido filtros para busca 100% automática dos 3 primeiros produtos
    const q = query(collection(db, 'produtos'), limit(3));
    
    return onSnapshot(q, (snapshot) => {
        const prods = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        console.log("Destaques automáticos recebidos:", prods);
        callback(prods);
    }, error => {
        console.error("Erro Firebase Destaques:", error);
    });
}

function buscarConfiguracoes() {
    console.log("Buscando configurações de bairros e pagamentos...");
    
    // Busca a coleção de Bairros
    const bairrosCollectionRef = collection(db, "bairros");
    onSnapshot(bairrosCollectionRef, (querySnapshot) => {
        const optionsList = document.getElementById("neighborhood-options-list");
        if (optionsList) {
            optionsList.innerHTML = '';
            
            querySnapshot.forEach((doc) => {
                const dadosBairro = doc.data();
                if (dadosBairro && dadosBairro.nome) {
                    const div = document.createElement("div");
                    div.className = "custom-option";
                    div.innerHTML = `
                        <span>${dadosBairro.nome}</span>
                        <small>R$ ${parseFloat(dadosBairro.taxa).toFixed(2)}</small>
                    `;
                    div.onclick = () => selectNeighborhood(dadosBairro.nome, dadosBairro.taxa);
                    optionsList.appendChild(div);
                }
            });
            console.log("Grid de bairros renderizado.");
        }
    }, (error) => {
        console.error("Erro ao carregar coleção de bairros:", error);
    });

    // Busca o documento de Pagamentos
    onSnapshot(doc(db, 'configuracoes', 'pagamentos'), (docSnap) => {
        if (docSnap.exists()) {
            configuracoes.metodos = docSnap.data().metodos || [];
            renderFormasPagamento();
        }
    });
}

async function enviarPedidoParaFirebase(dadosPedido) {
    try {
        const docRef = await addDoc(collection(db, 'pedidos'), {
            ...dadosPedido,
            status: 'pendente',
            createdAt: serverTimestamp()
        });
        return docRef.id;
    } catch (error) {
        console.error("Erro ao registrar pedido:", error);
        return null;
    }
}

// --- Atualização de UI Baseada em Dados ---

function setCategorias(novasCategorias) {
    categorias = novasCategorias;
    renderAbasCategorias();
    // Após renderizar as categorias, verifica o parâmetro da URL e ativa o botão correspondente
    const urlParams = new URLSearchParams(window.location.search);
    let currentCat = urlParams.get('cat');

    // Se não houver filtro na URL, define a primeira categoria do Firebase como padrão
    if (!currentCat && categorias.length > 0) {
        currentCat = categorias[0].nome;
    }

    if (currentCat) {
        // Busca uma correspondência flexível (ex: "bebidas" matching "Bebidas")
        const catEncontrada = categorias.find(c => 
            c.nome.toLowerCase() === currentCat.toLowerCase() || 
            c.nome.toLowerCase().includes(currentCat.toLowerCase())
        );

        const nomeParaFiltrar = catEncontrada ? catEncontrada.nome : currentCat;
        const activeBtn = document.querySelector(`.cat-btn[data-filter="${nomeParaFiltrar}"]`);
        
        if (activeBtn) {
            document.querySelector('.cat-btn.active')?.classList.remove('active');
            activeBtn.classList.add('active');
            renderProdutos(nomeParaFiltrar);
        }
    }
}

function setProdutos(novosProdutos) {
    produtos = novosProdutos;
    const urlParams = new URLSearchParams(window.location.search);
    const catParam = urlParams.get('cat');
    const isMenuPage = !!document.querySelector('.categories');

    let filtro = catParam || 'todos';
    if (isMenuPage && !catParam && categorias.length > 0) {
        filtro = categorias[0].nome;
    }

    renderProdutos(filtro, !isMenuPage);
}

function setAdicionais(novosAdicionais) {
    adicionais = novosAdicionais;
}

function renderAbasCategorias() {
    const container = document.querySelector('.categories');
    if (!container) return;
    let html = ``;
    categorias.forEach(cat => {
        // Usamos o nome da categoria como filtro para bater com o campo 'category' do produto
        html += `<button class="cat-btn" data-filter="${cat.nome}">${cat.nome}</button>`;
    });
    container.innerHTML = html;
    document.querySelectorAll('.cat-btn').forEach(btn => {
        btn.onclick = (e) => {
            document.querySelector('.cat-btn.active')?.classList.remove('active');
            e.currentTarget.classList.add('active');
            renderProdutos(e.currentTarget.dataset.filter);
        };
    });
}

function renderFormasPagamento() {
    const container = document.querySelector('.payment-options');
    if (!container || !configuracoes.metodos) return;
    
    let html = '';
    configuracoes.metodos.forEach((pag, index) => {
        // Normaliza o nome para o valor do input (ex: "Pix" -> "pix", "Cartão" -> "cartao")
        const value = pag.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '-');
        html += `
            <label>
                <input type="radio" name="payment-method" value="${value}" ${index === 0 ? 'checked' : ''}> ${pag}
            </label>
        `;
    });
    container.innerHTML = html;

    // Reatribui o evento para mostrar o campo de troco caso o método seja "Dinheiro"
    document.querySelectorAll('input[name="payment-method"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const changeSection = document.getElementById('change-section');
            if (changeSection) changeSection.style.display = e.target.value.includes('dinheiro') ? 'block' : 'none';
        });
    });
}

// Função para verificar se a loja está aberta
function checkStoreStatus() {
    const now = new Date();
    const day = now.getDay(); // 0: Domingo, 1: Segunda...
    const hour = now.getHours();
    const min = now.getMinutes();
    const time = hour + min / 60; // Converte para valor decimal para facilitar a comparação

    let isOpen = false;

    if (day >= 2 && day <= 5) { // Terça a Sexta: 14:00 - 22:30
        isOpen = (time >= 0 && time < 22.5);
    } else if (day === 6) { // Sábado: 14:00 - 23:00
        isOpen = (time >= 14 && time < 23);
    } else if (day === 0) { // Domingo: 18:00 - 23:00
        isOpen = (time >= 4 && time < 23);
    }
    
    const banner = document.getElementById('store-status-banner');
    if (banner) {
        if (isOpen) {
            banner.style.display = 'none';
            document.body.classList.remove('with-banner');
        } else {
            banner.style.display = 'flex';
            banner.innerHTML = '🔴 DESCULPE, ESTAMOS FECHADOS. CONSULTE NOSSOS HORÁRIOS.';
            banner.className = 'status-banner closed';
            document.body.classList.add('with-banner');
        }
    }
    return isOpen;
}

// Renderizar Produtos
function renderProdutos(filtro, apenasDestaques = false) {
    const grid = document.getElementById('product-grid');
    if (!grid) return;

    console.log("Categoria selecionada no clique:", filtro);

    // Lógica de filtragem reativa
    const filtrados = apenasDestaques 
        ? produtos // Na Home, o array já vem limitado pela query ouvirDestaquesAutomaticos
        : (filtro === 'todos' || !filtro
            ? produtos 
            : produtos.filter(p => p.category === filtro)); // Comparação exata (Ex: "Tradicionais")

    // Estado vazio: Melhor UX para o cliente
    if (filtrados.length === 0) {
        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; opacity: 0.6;">
                <i data-lucide="package-search" style="width: 48px; height: 48px; margin: 0 auto 15px;"></i>
                <p>Nenhum item disponível nesta categoria no momento.</p>
            </div>
        `;
        if (window.lucide) lucide.createIcons();
        return;
    }

    // Limpa o grid completamente para remover qualquer item estático residual
    grid.innerHTML = '';
    filtrados.forEach(p => {
        // Mapeamento das propriedades conforme o banco de dados (name, price, image)
        const imgPath = p.image || p.imagemUrl || './img/placeholder.png';
        const nome = p.name || p.nome;
        const descricao = p.description || p.desc || '';
        const preco = parseFloat(p.price || p.preco || 0);

        grid.innerHTML += `
            <div class="product-card">
                <img src="${imgPath}" alt="${nome}" loading="lazy">
                <div class="product-info">
                    <h3>${nome}</h3>
                    <p>${descricao}</p>
                    <span class="price">R$ ${preco.toFixed(2)}</span>
                    <button class="btn btn-primary w-100" onclick="addToCart('${p.id}')">Adicionar ao Carrinho</button>
                </div>
            </div>
        `;
    });
}

// Sistema de Carrinho
function toggleCart() {
    const cartSide = document.getElementById('side-cart');
    const isOpen = cartSide.classList.toggle('open');
    
    // Trava/Destrava o scroll
    if (isOpen) {
        document.documentElement.classList.add('no-scroll');
        document.body.classList.add('no-scroll');
    } else {
        document.documentElement.classList.remove('no-scroll');
        document.body.classList.remove('no-scroll');
    }
}

function toggleMobileMenu() {
    const navLinks = document.querySelector('.nav-links');
    const overlay = document.querySelector('.mobile-menu-overlay');
    
    navLinks.classList.toggle('active');
    if (overlay) overlay.classList.toggle('active');
    
    const isActive = navLinks.classList.contains('active');
    document.documentElement.classList.toggle('no-scroll', isActive);
    document.body.classList.toggle('no-scroll', isActive);
}

function addToCart(id) {
    currentProduct = produtos.find(p => p.id === id.toString());
    const modal = document.getElementById('product-modal');
    const modalBody = document.getElementById('modal-body');
    
    const isBebida = (currentProduct.category || "").toLowerCase().includes('bebida');
    const nome = currentProduct.name || currentProduct.nome;
    const img = currentProduct.imagemUrl || currentProduct.img;
    const preco = parseFloat(currentProduct.price || currentProduct.preco || 0);

    // Reset scroll do modal para o topo ao abrir
    modalBody.innerHTML = `
        <img src="${img}" class="modal-product-img">
        <h2 style="margin-bottom: 5px;">${nome}</h2>
        <p style="margin-bottom: 10px; font-size: 0.9rem; color: #666;">${currentProduct.description || currentProduct.desc || ""}</p>
        <span class="price" id="modal-total-price">R$ ${preco.toFixed(2)}</span>
        
        ${!isBebida ? `
        <div class="upgrade-section">
            <h3 style="font-size: 1.1rem; margin: 20px 0 10px;">Turbinar lanche (Escolha até 6)</h3>
            <div id="complementos-list">
                ${adicionais.map((c, index) => `
                    <div class="upgrade-item">
                        <div style="flex: 1;">
                            ${c.nome} <br> <small style="color: var(--primary); font-weight: bold;">+ R$ ${parseFloat(c.preco || 0).toFixed(2)}</small>
                        </div>
                        <div style="display:flex; align-items:center; gap:10px;">
                            <button onclick="changeUpgradeQtd(${index}, -1)" class="mini-btn">-</button>
                            <span id="upgrade-qtd-${index}" class="upgrade-qtd">0</span>
                            <button onclick="changeUpgradeQtd(${index}, 1)" class="mini-btn">+</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="obs-section" style="margin-top: 20px;">
            <h3 style="font-size: 1.1rem; margin-bottom: 10px;">Observações (Remover itens ou notas)</h3>
            <textarea id="modal-obs" placeholder="Ex: Tirar cebola, sem maionese..." style="width: 100%; min-height: 80px; padding: 10px; border-radius: 8px; border: 1px solid #ddd;"></textarea>
        </div>
        ` : ''}

        <button class="btn btn-primary w-100" style="margin-top: 20px;" onclick="confirmAddToCart()">Adicionar ao Carrinho</button>
    `;
    
    document.querySelector('.modal-content').scrollTop = 0;
    modal.style.display = "flex";
    document.documentElement.classList.add('no-scroll');
    document.body.classList.add('no-scroll');
}

function changeUpgradeQtd(index, delta) {
    const qtdSpan = document.getElementById(`upgrade-qtd-${index}`);
    let currentQtd = parseInt(qtdSpan.innerText);
    
    const allSpans = document.querySelectorAll('.upgrade-qtd');
    let totalUpgradeQtd = 0;
    allSpans.forEach(s => totalUpgradeQtd += parseInt(s.innerText));
    
    if (delta > 0 && totalUpgradeQtd >= 6) {
        return alert("Você atingiu o limite de 6 itens extras!");
    }
    
    let newQtd = currentQtd + delta;
    if (newQtd >= 0) {
        qtdSpan.innerText = newQtd;
        updateModalTotal();
    }
}

function updateModalTotal() {
    if (!currentProduct) return;
    const upgradeSpans = document.querySelectorAll('.upgrade-qtd');
    let extrasTotal = 0;

    upgradeSpans.forEach((span, index) => {
        const qtd = parseInt(span.innerText);
        const precoAdicional = parseFloat(adicionais[index]?.preco || 0);
        extrasTotal += qtd * precoAdicional;
    });

    const precoOriginal = parseFloat(currentProduct.price || currentProduct.preco || 0);
    const totalFinal = precoOriginal + extrasTotal;
    document.getElementById('modal-total-price').innerText = `R$ ${totalFinal.toFixed(2)}`;
}

function closeModal() {
    document.getElementById('product-modal').style.display = "none";
    document.documentElement.classList.remove('no-scroll');
    document.body.classList.remove('no-scroll');
}

// Fechar modal ao clicar fora
window.onclick = function(event) {
    const modal = document.getElementById('product-modal');
    if (event.target == modal) {
        closeModal();
    }
};

function confirmAddToCart() {
    const upgradeSpans = document.querySelectorAll('.upgrade-qtd');
    const selectedComps = [];
    
    upgradeSpans.forEach((span, index) => {
        const qtd = parseInt(span.innerText);
        if (qtd > 0) {
            selectedComps.push({ ...adicionais[index], qtd: qtd });
        }
    });

    const obsElement = document.getElementById('modal-obs');
    const obs = obsElement ? obsElement.value.trim() : '';
    
    // Identificador único para variações do mesmo item baseado nas escolhas
    const extrasKey = selectedComps.map(c => `${c.nome}:${c.qtd}`).sort().join(',') + '|' + obs;
    const itemIdentico = cart.find(item => item.id === currentProduct.id && item.extrasKey === extrasKey);

    if (itemIdentico) {
        itemIdentico.qtd++;
    } else {
        cart.push({ 
            ...currentProduct, 
            qtd: 1, 
            complementos: selectedComps, 
            obs: obs,
            extrasKey: extrasKey 
        });
    }

    updateCartUI();

    // Transforma o conteúdo do modal em uma tela de confirmação de sucesso
    const modalBody = document.getElementById('modal-body');
    modalBody.innerHTML = `
        <div style="text-align: center; padding: 20px 0;">
            <div style="margin-bottom: 20px;">
                <i data-lucide="check-circle-2" style="width: 64px; height: 64px; color: #27ae60; margin: 0 auto;"></i>
            </div>
            <h2 style="margin-bottom: 10px;">Adicionado com sucesso!</h2>
            <p style="margin-bottom: 25px; color: #666;">${currentProduct.name || currentProduct.nome} já está no seu carrinho.</p>
            <div style="display: flex; flex-direction: column; gap: 12px;">
                <button class="btn btn-primary w-100" onclick="closeModal(); toggleCart();">Visualizar Carrinho</button>
                <button class="btn btn-secondary w-100" onclick="closeModal()">Continuar Comprando</button>
            </div>
        </div>
    `;
    lucide.createIcons();
}

function updateCartUI() {
    const cartList = document.getElementById('cart-items');
    const count = document.getElementById('cart-count');
    const total = document.getElementById('total-price');
    const checkoutTotal = document.getElementById('checkout-total-price');
    const finalizeBtn = document.getElementById('finalize-button');
    
    cartList.innerHTML = '';
    const isOpen = checkStoreStatus();

    let totalValue = 0;
    let totalItems = 0;

    if (cart.length === 0) {
        cartList.innerHTML = `
            <div style="text-align:center; padding:40px 20px;">
                <p style="color:#666; margin-bottom:15px;">🛒 Seu carrinho está vazio.</p>
                <a href="menu.html" class="btn btn-secondary" style="font-size: 0.85rem; margin:0; padding:10px 20px;" onclick="toggleCart()">Ir para o Cardápio</a>
            </div>
        `;
        if (finalizeBtn) {
            finalizeBtn.disabled = true;
            finalizeBtn.style.opacity = '0.5';
            finalizeBtn.style.cursor = 'not-allowed';
        }
    } else {
        if (finalizeBtn && isOpen) {
            finalizeBtn.disabled = false;
            finalizeBtn.style.opacity = '1';
            finalizeBtn.style.cursor = 'pointer';
            finalizeBtn.innerText = "Finalizar Pedido";
        } else if (finalizeBtn && !isOpen) {
            finalizeBtn.disabled = true;
            finalizeBtn.style.opacity = '0.5';
            finalizeBtn.style.cursor = 'not-allowed';
            finalizeBtn.innerText = "Loja Fechada";
        }
        cart.forEach((item, index) => {
            const valorComps = item.complementos ? item.complementos.reduce((acc, c) => acc + (c.preco * c.qtd), 0) : 0;
            const precoBase = parseFloat(item.price || item.preco || 0);
            const precoUnitarioTotal = precoBase + valorComps;
            
            totalValue += precoUnitarioTotal * item.qtd;
            totalItems += item.qtd;

            let detailsHtml = '';
            if(item.complementos && item.complementos.length > 0) {
                detailsHtml += `<small style="display:block; color:#888; font-size: 0.75rem;">Turbinado: ${item.complementos.map(c => `${c.qtd}x ${c.nome}`).join(', ')}</small>`;
            }
            if(item.obs) {
                detailsHtml += `<small style="display:block; color:var(--primary); font-size: 0.75rem;">Obs: ${item.obs}</small>`;
            }

            cartList.innerHTML += `
                <div class="cart-item-row" style="display:flex; justify-content:space-between; margin-bottom:15px; align-items:center;">
                    <div style="flex: 1; padding-right: 10px;">
                        <strong>${item.name || item.nome}</strong><br>
                        ${detailsHtml}
                        <small>R$ ${precoUnitarioTotal.toFixed(2)}</small>
                    </div>
                    <div style="display:flex; align-items:center; gap:10px;">
                        <button onclick="changeQtd(${index}, -1)" style="border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">-</button>
                        <span>${item.qtd}</span>
                        <button onclick="changeQtd(${index}, 1)" style="border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">+</button>
                    </div>
                </div>
            `;
        });
    }

    // Lógica de Taxa de Entrega
    const orderTypeInput = document.querySelector('input[name="order-type"]:checked');
    const orderType = orderTypeInput ? orderTypeInput.value : 'delivery';
    const neighborhoodValue = document.getElementById('neighborhood-value');
    let deliveryFee = 0;

    if (orderType === 'delivery' && neighborhoodValue) {
        deliveryFee = parseFloat(neighborhoodValue.value) || 0;
    }

    const deliveryFeeElement = document.getElementById('delivery-fee');
    if (deliveryFeeElement) deliveryFeeElement.innerText = `R$ ${deliveryFee.toFixed(2)}`;
    
    count.innerText = totalItems;
    total.innerText = `R$ ${(totalValue + deliveryFee).toFixed(2)}`;
    if (checkoutTotal) checkoutTotal.innerText = `R$ ${(totalValue + deliveryFee).toFixed(2)}`;

    localStorage.setItem('casaDoPastelCart', JSON.stringify(cart));
}

function changeQtd(index, delta) {
    cart[index].qtd += delta;
    if (cart[index].qtd <= 0) cart.splice(index, 1);
    updateCartUI();
}

function checkout() {
    if (!checkStoreStatus()) {
        return alert("Infelizmente estamos fechados no momento. Consulte nossos horários de funcionamento.");
    }
    
    if(cart.length === 0) return alert("Seu carrinho está vazio!");

    // Verificação de upsell de bebidas
    const temBebida = cart.some(item => (item.category || "").toLowerCase().includes('bebida'));
    if (!temBebida) {
        openUpsellModal();
        return;
    }

    openCheckoutModal();
}

function openCheckoutModal() {
    const modal = document.getElementById('checkout-modal');
    if (modal) {
        modal.style.display = "flex";
        document.documentElement.classList.add('no-scroll');
        document.body.classList.add('no-scroll');
        updateCartUI();
    }
}

function openUpsellModal() {
    const modal = document.getElementById('upsell-modal');
    if (modal) {
        modal.style.display = "flex";
        document.documentElement.classList.add('no-scroll');
        document.body.classList.add('no-scroll');
    }
}

function closeUpsellModal() {
    const modal = document.getElementById('upsell-modal');
    if (modal) {
        modal.style.display = "none";
        document.documentElement.classList.remove('no-scroll');
        document.body.classList.remove('no-scroll');
    }
}

function closeUpsellAndCheckout() {
    closeUpsellModal();
    openCheckoutModal();
}

function goToDrinks() {
    closeUpsellModal();
    
    // Fecha o carrinho para desobstruir a visão do cardápio (essencial no mobile)
    const cartSide = document.getElementById('side-cart');
    if (cartSide && cartSide.classList.contains('open')) {
        toggleCart();
    }
    
    // Busca no array de categorias qual delas se assemelha a "bebida"
    const catBebida = categorias.find(c => 
        c.nome.toLowerCase().includes('bebida')
    );

    const nomeFiltro = catBebida ? catBebida.nome : 'bebidas';
    const drinkBtn = document.querySelector(`.cat-btn[data-filter="${nomeFiltro}"]`);
    
    if (drinkBtn) {
        drinkBtn.click();
        const menuSection = document.getElementById('menu');
        if (menuSection) menuSection.scrollIntoView({ behavior: 'smooth' });
    } else {
        window.location.href = `menu.html?cat=${encodeURIComponent(nomeFiltro)}`;
    }
}

function closeCheckoutModal() {
    document.getElementById('checkout-modal').style.display = "none";
    document.documentElement.classList.remove('no-scroll');
    document.body.classList.remove('no-scroll');
}

async function sendOrder() {
    const phoneNumber = "5599984657611"; // SUBSTITUA pelo seu número (DDI + DDD + Número)

    // Coleta dados da UI
    const clientName = document.getElementById('client-name').value.trim();
    const clientPhone = document.getElementById('client-phone').value.trim();
    const orderType = document.querySelector('input[name="order-type"]:checked').value;
    const street = document.getElementById('addr-street').value.trim();
    const number = document.getElementById('addr-number').value.trim();
    const complement = document.getElementById('addr-complement').value.trim();
    const neighborhoodValue = document.getElementById('neighborhood-value');
    const paymentMethodInput = document.querySelector('input[name="payment-method"]:checked');
    const paymentMethod = paymentMethodInput ? paymentMethodInput.value : 'pix';
    const changeValue = document.getElementById('change-input').value.trim();

    // Validação de dados do cliente
    if (!clientName || !clientPhone) {
        return alert("Por favor, informe seu nome e telefone!");
    }

    // Validação de endereço para delivery
    if (orderType === 'delivery') {
        const val = neighborhoodValue.value;
        if (!val || val === "0") {
            return alert("Por favor, selecione seu bairro!");
        }
        if (!street || !number || !complement) {
            if (!street) document.getElementById('addr-street').focus();
            else if (!number) document.getElementById('addr-number').focus();
            else document.getElementById('addr-complement').focus();
            return alert("Por favor, informe a rua, o número e o complemento para entrega!");
        }
    }

    const total = document.getElementById('checkout-total-price').innerText;
    const statusMsg = document.getElementById('status-msg-checkout');

    const feeValue = orderType === 'delivery' ? (parseFloat(neighborhoodValue.value) || 0) : 0;
    const neighborhoodName = orderType === 'delivery' ? document.getElementById('selected-neighborhood-text').innerText : 'Retirada';

    // 1. Array de itens mapeado corretamente (essencial para listagens e relatórios de "Mais Vendidos")
    const itens = cart.map(item => ({
        id: item.id,
        name: item.name || item.nome,
        price: parseFloat(item.price || item.preco || 0),
        qtd: item.qtd,
        obs: item.obs || "",
        complementos: item.complementos || [],
    }));

    // 2. Montagem do pedidoData limpo, sem poluir a raiz com ...cart[0]
    const pedidoData = {
        nomeCliente: clientName,
        telefone: clientPhone,
        itens: itens, // Agora o admin consegue iterar sobre pedido.itens
        formaPagamento: paymentMethod, // Valor capturado do input radio
        taxaEntrega: feeValue, // Salvo como Number para cálculos no Admin
        bairro: neighborhoodName,
        total: parseFloat(total.replace('R$ ', '').replace(',', '.')),
        tipo: orderType,
        detalhesEndereco: orderType === 'delivery' ? { street, number, complement } : null,
        troco: paymentMethod === 'dinheiro' ? changeValue : null
    };

    statusMsg.innerText = "⏳ Registrando pedido...";
    await enviarPedidoParaFirebase(pedidoData);

    // Formatação da mensagem para o WhatsApp
    let message = `📍 *NOVO PEDIDO - CASA DO PASTEL*\n`;
    message += `👤 *Cliente:* ${clientName}\n`;
    message += `📞 *Contato:* ${clientPhone}\n\n`;

    message += `📝 *ITENS:*\n\n`;
    
    cart.forEach(item => {
        const cat = (item.category || "").toLowerCase();
        let tipo = "";

        // Definição dos tipos com base na categoria
        const categoriasPastel = ['carne de sol', 'frango', 'queijo', 'bauru', 'portuguesa', 'sabores especiais'];

        if (categoriasPastel.includes(cat)) {
            tipo = "Pastel ";
        } else if (cat === 'massas') {
            tipo = "Panqueca ";
        } else if (cat === 'macarronadas') {
            tipo = "Macarronada ";
        } else if (cat !== "") {
            // Para outras categorias, tentamos singularizar o nome (ex: Bebidas -> Bebida)
            tipo = item.category.endsWith('s') ? item.category.slice(0, -1) + " " : item.category + " ";
        }

        message += `${item.qtd}x ${tipo}${item.name || item.nome}`;
        if(item.complementos && item.complementos.length > 0) {
            message += ` (Turbinado: ${item.complementos.map(c => `${c.qtd}x ${c.nome}`).join(', ')})`;
        }
        if(item.obs) message += ` [Obs: ${item.obs}]`;
        message += `\n\n`;
    });

    if (orderType === 'delivery') {
        const neighborhoodName = document.getElementById('selected-neighborhood-text').innerText;

        message += `🏠 *ENTREGA:*\n`;
        message += `${street}, ${number} - ${neighborhoodName}\n`;
        message += `Ref: ${complement}\n\n`;
    } else {
        message += `🏪 *RETIRADA NO LOCAL*\n\n`;
    }

    message += `💰 *PAGAMENTO:* ${paymentMethod.charAt(0).toUpperCase() + paymentMethod.slice(1)}\n`;
    if (paymentMethod === 'dinheiro' && changeValue) {
        message += `💵 *Troco para:* R$ ${changeValue}\n`;
    }
    if (orderType === 'delivery') message += `Taxa de Entrega: R$ ${feeValue.toFixed(2)}\n`;
    message += `💵 *TOTAL: ${total}*`;

    // Codifica a mensagem para URL
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;

    statusMsg.innerText = "🚀 Redirecionando para o WhatsApp...";

    setTimeout(() => {
        window.open(whatsappUrl, '_blank');
        statusMsg.innerText = "✅ Pedido enviado!";

        // Limpa o carrinho na memória e atualiza a UI (que também limpa o localStorage)
        cart = [];
        updateCartUI();

        // Fecha o modal de checkout após um curto intervalo para o usuário ver a confirmação
        setTimeout(closeCheckoutModal, 2000);
    }, 1000);
}

// --- Funções Custom Select ---
function toggleNeighborhoodSelect() {
    const container = document.getElementById('neighborhood-custom-select');
    const options = document.getElementById('neighborhood-options-list');
    const isOpen = container.classList.toggle('open');
    options.style.display = isOpen ? 'grid' : 'none';
}

function selectNeighborhood(nome, taxa) {
    document.getElementById('selected-neighborhood-text').innerText = nome;
    document.getElementById('neighborhood-value').value = taxa;
    toggleNeighborhoodSelect();
    updateCartUI();
}

// Fechar ao clicar fora
document.addEventListener('click', (e) => {
    const container = document.getElementById('neighborhood-custom-select');
    if (container && !container.contains(e.target)) {
        container.classList.remove('open');
        document.getElementById('neighborhood-options-list').style.display = 'none';
    }
});

// Animação de Scroll
function setupScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.scroll-reveal').forEach(el => observer.observe(el));
}

// Expor funções necessárias para o HTML (escopo global)
window.toggleCart = toggleCart;
window.toggleMobileMenu = toggleMobileMenu;
window.addToCart = addToCart;
window.closeModal = closeModal;
window.confirmAddToCart = confirmAddToCart;
window.changeQtd = changeQtd;
window.checkout = checkout;
window.sendOrder = sendOrder;
window.changeUpgradeQtd = changeUpgradeQtd;
window.closeCheckoutModal = closeCheckoutModal;
window.closeUpsellModal = closeUpsellModal;
window.closeUpsellAndCheckout = closeUpsellAndCheckout;
window.goToDrinks = goToDrinks;
window.toggleNeighborhoodSelect = toggleNeighborhoodSelect;
window.selectNeighborhood = selectNeighborhood;
