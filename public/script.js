// ================= BACKEND BASE URL =================
const API_BASE = "https://moryastationery-backend.onrender.com";

// ================= AUTH CHECK & LOGOUT =================
async function checkAuth(){
  try{
    const res = await fetch(`${API_BASE}/api/check-auth`, {
      credentials: 'include'
    });
    const data = await res.json();

    const loginLink = document.getElementById('loginLink');
    const logoutLink = document.getElementById('logoutLink');

    if(data.loggedIn){
      if(loginLink) loginLink.textContent = data.username;
      if(logoutLink) logoutLink.style.display = 'inline';
    } else {
      if(loginLink) loginLink.textContent = 'Login';
      if(logoutLink) logoutLink.style.display = 'none';
    }
  }catch(err){
    console.error(err);
  }
}

const logoutLinkEl = document.getElementById('logoutLink');
if(logoutLinkEl){
  logoutLinkEl.addEventListener('click', async (e)=>{
    e.preventDefault();
    await fetch(`${API_BASE}/api/logout`, {
      method: 'POST',
      credentials: 'include'
    });
    window.location.href = 'login.html';
  });
}

// ================= PRODUCTS + CART =================
const productsGrid = document.getElementById('productsGrid');
let cart = JSON.parse(localStorage.getItem('cart')) || [];

async function loadProducts(){
  try{
    const res = await fetch(`${API_BASE}/api/products`, {
      credentials: 'include'
    });
    const products = await res.json();

    if(productsGrid){
      productsGrid.innerHTML = '';

      products.forEach(p=>{
        const div = document.createElement('div');
        div.className = 'product-card';
        div.innerHTML = `
          <img src="${p.image}" alt="${p.name}" width="120">
          <h4>${p.name}</h4>
          <p>${p.description || ''}</p>
          <p>₹${p.price}</p>
          <button 
            data-id="${p._id}" 
            data-name="${p.name}" 
            data-price="${p.price}" 
            data-img="${p.image}">
            Add to Cart
          </button>
        `;
        productsGrid.appendChild(div);
      });

      document.querySelectorAll('.product-card button').forEach(btn=>{
        btn.addEventListener('click', async ()=>{
          const authRes = await fetch(`${API_BASE}/api/check-auth`, {
            credentials: 'include'
          });
          const authData = await authRes.json();

          if(!authData.loggedIn){
            alert('Please register/login before adding products to cart.');
            window.location.href = 'login.html';
            return;
          }

          const id = btn.dataset.id;
          const name = btn.dataset.name;
          const price = Number(btn.dataset.price);
          const img = btn.dataset.img;

          addToCart(id, name, price, img);
        });
      });
    }
  }catch(err){
    console.error(err);
  }
}

function addToCart(id, name, price, image){
  const existing = cart.find(i => i.id === id);
  if(existing) existing.qty += 1;
  else cart.push({ id, name, price, qty: 1, image });

  localStorage.setItem('cart', JSON.stringify(cart));
  updateCartCount();
}

function updateCartCount(){
  const count = cart.reduce((s, i) => s + i.qty, 0);
  const el = document.getElementById('cartCount');
  if(el) el.textContent = count;
}

// ================= CART MODAL =================
const viewCartBtn = document.getElementById('viewCartBtn');
const cartModal = document.getElementById('cartModal');
const closeCartBtn = document.getElementById('closeCartBtn');
const cartItemsDiv = document.getElementById('cartItems');
const cartTotalDiv = document.getElementById('cartTotal');
const checkoutBtn = document.getElementById('checkoutBtn');

if(viewCartBtn) viewCartBtn.addEventListener('click', ()=>{
  renderCart();
  cartModal.style.display = 'block';
});

if(closeCartBtn) closeCartBtn.addEventListener('click', ()=>{
  cartModal.style.display = 'none';
});

function renderCart(){
  cartItemsDiv.innerHTML = '';
  let total = 0;

  if(cart.length === 0){
    cartItemsDiv.innerHTML = '<div>Your cart is empty</div>';
    return;
  }

  cart.forEach(item=>{
    const d = document.createElement('div');
    d.innerHTML = `
      <img src="${item.image}" width="40">
      ${item.name} x ${item.qty} = ₹${item.qty * item.price}
    `;
    cartItemsDiv.appendChild(d);
    total += item.qty * item.price;
  });

  cartTotalDiv.textContent = 'Total: ₹' + total;
}

// ================= PAYMENT =================
const paymentModal = document.getElementById('paymentModal');
const cardForm = document.getElementById('cardForm');

document.querySelectorAll("input[name='payment']").forEach(r=>{
  r.addEventListener('change', ()=>{
    const v = document.querySelector("input[name='payment']:checked").value;
    cardForm.style.display = v === 'Card' ? 'block' : 'none';
  });
});

const confirmPaymentBtn = document.getElementById('confirmPaymentBtn');
const cancelPaymentBtn = document.getElementById('cancelPaymentBtn');

if(checkoutBtn){
  checkoutBtn.addEventListener('click', async ()=>{
    if(cart.length === 0){
      alert('Cart is empty!');
      return;
    }

    const authRes = await fetch(`${API_BASE}/api/check-auth`, {
      credentials: 'include'
    });
    const authData = await authRes.json();

    if(!authData.loggedIn){
      alert('Please login to place order');
      window.location.href = 'login.html';
      return;
    }

    paymentModal.style.display = 'block';
  });
}

if(cancelPaymentBtn){
  cancelPaymentBtn.addEventListener('click', ()=>{
    paymentModal.style.display = 'none';
  });
}

if(confirmPaymentBtn){
  confirmPaymentBtn.addEventListener('click', async ()=>{
    const selected = document.querySelector("input[name='payment']:checked").value;

    if(selected === 'Card'){
      const card = document.getElementById('cardNumber').value.trim();
      const exp = document.getElementById('expiry').value.trim();
      const cvv = document.getElementById('cvv').value.trim();

      if(!/^\d{16}$/.test(card)) return alert('Invalid card number');
      if(!/^(0[1-9]|1[0-2])\/\d{2}$/.test(exp)) return alert('Invalid expiry');
      if(!/^\d{3}$/.test(cvv)) return alert('Invalid CVV');
    }

    const items = cart.map(i => ({
      productId: i.id,
      quantity: i.qty
    }));

    try{
      const res = await fetch(`${API_BASE}/api/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ items, paymentMethod: selected })
      });

      const data = await res.json();

      if(res.ok){
        alert('Order placed successfully');
        localStorage.removeItem('cart');
        window.location.href = 'order.html';
      } else {
        alert(data.message || 'Order failed');
      }
    }catch(err){
      console.error(err);
      alert('Order error');
    }
  });
}

// ================= ORDER TRACKING =================
document.addEventListener("DOMContentLoaded", () => {
  checkAuth();
  updateCartCount();
  if(productsGrid) loadProducts();

  const trackForm = document.getElementById("trackForm");
  if(trackForm){
    trackForm.addEventListener("submit", async (e)=>{
      e.preventDefault();

      const orderId = document.getElementById("orderId").value.trim();
      if(!orderId) return;

      try{
        const res = await fetch(`${API_BASE}/api/track-order/${orderId}`);
        const data = await res.json();

        if(res.ok){
          document.getElementById("trackingResult").innerHTML = `
            <h3>Order ID: ${data.orderId}</h3>
            <p>Status: <strong>${data.status}</strong></p>
            <p>Payment Method: ${data.paymentMethod}</p>
            <p>Ordered On: ${new Date(data.createdAt).toLocaleString()}</p>
          `;
        } else {
          document.getElementById("trackingResult").innerHTML =
            `<p style="color:red;">${data.message}</p>`;
        }
      }catch(err){
        console.error(err);
        document.getElementById("trackingResult").innerHTML =
          `<p style="color:red;">Error fetching order.</p>`;
      }
    });
  }
});
