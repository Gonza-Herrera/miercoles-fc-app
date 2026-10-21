import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { EventStateService } from '../../services/event-state.service';

@Component({
  selector: 'app-dinner-menu',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  template: `
    <div class="page-container animate-fade-in">
      <!-- Top Bar -->
      <header class="header-bar">
        <button class="icon-back-btn" (click)="goBack()">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <span class="header-title">Cena</span>
        <div class="avatar-badge">GH</div>
      </header>

      <div class="content-scroll">
        <!-- Subheader Tabs: Menú vs Asistentes -->
        <div class="dinner-tabs">
          <button 
            type="button" 
            class="tab-btn active" 
            routerLink="/cena/menu">
            Menú
          </button>
          <button 
            type="button" 
            class="tab-btn" 
            routerLink="/cena/asistentes">
            Asistentes ({{ state.dinnerAttendeeIds().length }})
          </button>
        </div>

        <!-- Tarjeta de Título del Menú Gastronómico -->
        <div class="menu-title-card">
          <div class="menu-title-header">
            <div class="title-meta-left">
              <span class="menu-badge">👨‍🍳 Menú de hoy</span>
              @if (!state.canEditDinner() || !isEditingTitle()) {
                <h3 class="current-dinner-title">{{ state.currentEvent().dinnerTitle || 'Menú por definir' }}</h3>
              } @else {
                <div class="edit-title-input-row">
                  <input 
                    type="text" 
                    [(ngModel)]="tempDinnerTitle" 
                    placeholder="Ej: Ravioles al disco, Asado y choripanes..." 
                    class="input-title-edit" 
                    (keyup.enter)="saveTitle()" />
                  <button class="btn-save-title" (click)="saveTitle()">Guardar</button>
                </div>
              }
            </div>
            @if (state.canEditDinner() && !isEditingTitle()) {
              <button class="btn-edit-title" (click)="startEditTitle()" title="Cambiar menú">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <path d="M12 20h9"></path>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
                </svg>
              </button>
            }
          </div>

          <!-- Sugerencias rápidas de menú -->
          @if (state.canEditDinner() && isEditingTitle()) {
            <div class="quick-suggestions-row">
              <span class="sugg-label">Sugeridos:</span>
              <button type="button" class="sugg-chip" (click)="selectSuggestion('Ravioles al disco')">🍝 Ravioles al disco</button>
              <button type="button" class="sugg-chip" (click)="selectSuggestion('Asado')">🥩 Asado</button>
              <button type="button" class="sugg-chip" (click)="selectSuggestion('Hamburguesas')">🍔 Hamburguesas</button>
              <button type="button" class="sugg-chip" (click)="selectSuggestion('Pizzas caseras')">🍕 Pizzas caseras</button>
              <button type="button" class="sugg-chip" (click)="selectSuggestion('Parri Pollo')">🐔 Parri Pollo</button>
            </div>
          }
        </div>

        <!-- Tarjeta de Encargado de las Compras -->
        <div class="shopper-card">
          <div class="shopper-left">
            <div class="shopper-icon-box">🛒</div>
            <div>
              <span class="shopper-label">Encargado de compras</span>
              @if (currentShopper(); as shopper) {
                <div class="shopper-person">
                  <img [src]="shopper.avatar" [alt]="shopper.name" class="shopper-avatar" />
                  <span class="shopper-name">{{ shopper.name }}</span>
                </div>
              } @else {
                <span class="no-shopper-text">Sin asignar aún</span>
              }
            </div>
          </div>

          @if (state.canEditDinner()) {
          <button class="btn-change-shopper" (click)="showShopperSelector.set(!showShopperSelector())">
            {{ currentShopper() ? 'Cambiar' : 'Asignar' }}
          </button>
          }
        </div>

        <!-- Selector Desplegable de Encargado -->
        @if (state.canEditDinner() && showShopperSelector()) {
          <div class="shopper-selector-box animate-fade-in">
            <span class="picker-hint">Seleccioná quién va a hacer las compras:</span>
            <div class="shopper-chips-list">
              @for (p of state.players(); track p.id) {
                <button 
                  type="button" 
                  class="shopper-person-chip"
                  [class.active]="state.currentEvent().dinnerShopperPlayerId === p.id"
                  (click)="setShopper(p.id)">
                  <img [src]="p.avatar" [alt]="p.name" class="chip-avatar" />
                  <span>{{ p.name }}</span>
                </button>
              }
            </div>
          </div>
        }

        <div class="section-items-header">
          <h4>Detalle de compras y gastos</h4>
        </div>

        <!-- Menu items list -->
        <div class="menu-list">
          @for (item of state.currentEvent().menuItems; track item.id) {
            <div class="menu-item-row">
              <div class="item-left">
                <span class="item-icon">{{ item.icon }}</span>
                <div class="item-text-group">
                  <span class="item-name">{{ item.name }}</span>
                  <!-- Comprador asignado a este ítem particular o general -->
                  @let buyer = getItemBuyer(item);
                  @if (buyer) {
                    <span class="item-buyer-tag">
                      Compró: <strong>{{ buyer.name }}</strong>
                    </span>
                  }
                </div>
              </div>
              <div class="item-right">
                <span class="item-amount">\${{ item.amount | number }}</span>
                @if (state.canEditDinner()) {
                <button class="btn-delete" (click)="removeItem(item.id)">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
                }
              </div>
            </div>
          }
        </div>

        <!-- Modal or Inline Add Item -->
        @if (state.canEditDinner() && showAddForm()) {
          <div class="add-item-card">
            <h4>Agregar gasto de la cena</h4>
            <div class="form-row">
              <input 
                type="text" 
                placeholder="Nombre (ej: Postre, Hielo, Carbón)" 
                [(ngModel)]="newItemName" 
                class="form-input" />
            </div>
            <div class="form-row">
              <input 
                type="number" 
                placeholder="Monto $" 
                [(ngModel)]="newItemAmount" 
                class="form-input" />
            </div>
            <!-- Asignar quién pagó/compró este ítem específico -->
            <div class="form-row">
              <label class="form-sublabel">¿Quién hizo esta compra?</label>
              <select [(ngModel)]="newItemBuyerId" class="form-select">
                <option [ngValue]="undefined">Encargado general ({{ currentShopper()?.name || 'Por defecto' }})</option>
                @for (p of state.players(); track p.id) {
                  <option [ngValue]="p.id">{{ p.name }}</option>
                }
              </select>
            </div>
            <div class="form-actions">
              <button class="btn btn-secondary btn-sm" (click)="showAddForm.set(false)">Cancelar</button>
              <button class="btn btn-primary btn-sm" (click)="confirmAddItem()">Guardar ítem</button>
            </div>
          </div>
        } @else if (state.canEditDinner()) {
          <!-- Add Item Button -->
          <button class="btn-add-item" (click)="showAddForm.set(true)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            Agregar ítem
          </button>
        }

      </div>

    </div>

      <!-- Keep the fixed bar outside the animated page (a transformed ancestor
           otherwise makes position: fixed move with the scrolling content). -->
      <!-- Footer Total Bar -->
      <div class="footer-total-bar">
        <div class="total-col">
          <span class="total-label">Total</span>
          <span class="total-val">\${{ state.dinnerTotalAmount() | number }}</span>
        </div>
        @if (state.canEditDinner()) {
        <button class="btn btn-primary" routerLink="/cena/asistentes">
          Continuar
        </button>
        }
      </div>
  `,
  styles: [`
    :host {
      display: block;
      --dinner-total-bar-height: 84px;
    }

    .page-container {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      padding-bottom: calc(var(--dinner-total-bar-height) + var(--bottom-nav-content-height));
      background: var(--bg-app);
    }

    .icon-back-btn {
      background: none;
      border: none;
      padding: 6px;
      cursor: pointer;
      color: var(--text-main);
    }

    .header-title {
      font-weight: 700;
      font-size: 1rem;
    }

    .content-scroll {
      flex: 1;
      padding: 20px 18px 24px;
    }

    .dinner-tabs {
      display: flex;
      background: #E2E8F0;
      border-radius: 12px;
      padding: 4px;
      margin-bottom: 20px;
      gap: 4px;
    }

    .tab-btn {
      flex: 1;
      border: none;
      background: transparent;
      padding: 10px;
      border-radius: 9px;
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--text-muted);
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      transition: all 0.2s ease;
    }

    .tab-btn.active {
      background: var(--primary);
      color: white;
      box-shadow: 0 2px 6px rgba(79, 70, 229, 0.25);
    }

    .menu-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
      margin-bottom: 16px;
    }

    .menu-item-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: white;
      padding: 14px 16px;
      border-radius: 16px;
      border: 1px solid var(--border-color);
    }

    .item-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .item-icon {
      font-size: 1.4rem;
    }

    .item-name {
      font-weight: 700;
      font-size: 1rem;
      color: var(--text-main);
    }

    .item-right {
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .item-amount {
      font-weight: 800;
      font-size: 1.05rem;
      color: var(--text-main);
    }

    .btn-delete {
      background: none;
      border: none;
      color: var(--text-light);
      cursor: pointer;
      padding: 4px;
    }

    .btn-delete:hover {
      color: var(--danger);
    }

    .btn-add-item {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      padding: 14px;
      background: white;
      border: 1.5px dashed var(--primary);
      border-radius: 14px;
      color: var(--primary);
      font-weight: 700;
      font-size: 0.95rem;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .btn-add-item:hover {
      background: var(--primary-light);
    }

    .add-item-card {
      background: white;
      padding: 16px;
      border-radius: 16px;
      border: 1px solid var(--border-color);
      box-shadow: var(--shadow-sm);
    }

    .add-item-card h4 {
      font-size: 0.95rem;
      font-weight: 700;
      margin-bottom: 12px;
    }

    .form-row {
      margin-bottom: 10px;
    }

    .form-input {
      width: 100%;
      padding: 12px;
      border-radius: 10px;
      border: 1px solid var(--border-color);
      font-size: 0.95rem;
      font-family: inherit;
    }

    .form-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
    }

    .btn-sm {
      padding: 8px 14px;
      font-size: 0.85rem;
    }

    .footer-total-bar {
      height: var(--dinner-total-bar-height);
      position: fixed;
      bottom: var(--bottom-nav-height);
      left: 50%;
      transform: translateX(-50%);
      width: 100%;
      max-width: 480px;
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(8px);
      border-top: 1px solid var(--border-color);
      padding: 14px 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 45;
      box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.05);
    }

    /* Tarjeta de Título del Menú Gastronómico */
    .menu-title-card {
      background: linear-gradient(135deg, #FFF7ED 0%, #FFFFFF 100%);
      border: 1.5px solid #FFEDD5;
      border-radius: 18px;
      padding: 16px 18px;
      margin-bottom: 20px;
      box-shadow: 0 2px 10px rgba(234, 88, 12, 0.06);
    }

    .menu-title-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .title-meta-left {
      flex: 1;
    }

    .menu-badge {
      display: inline-block;
      font-size: 0.72rem;
      font-weight: 800;
      color: #EA580C;
      background: #FFEDD5;
      padding: 3px 8px;
      border-radius: 6px;
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .current-dinner-title {
      font-size: 1.35rem;
      font-weight: 900;
      color: var(--text-main);
      letter-spacing: -0.3px;
    }

    .edit-title-input-row {
      display: flex;
      gap: 8px;
      margin-top: 4px;
    }

    .input-title-edit {
      flex: 1;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1.5px solid #EA580C;
      font-size: 0.95rem;
      font-weight: 700;
      font-family: inherit;
    }

    .btn-save-title {
      background: #EA580C;
      color: white;
      border: none;
      padding: 8px 14px;
      border-radius: 10px;
      font-weight: 700;
      font-size: 0.85rem;
      cursor: pointer;
    }

    .btn-edit-title {
      background: white;
      border: 1px solid #FFEDD5;
      color: #EA580C;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: var(--shadow-sm);
    }

    .quick-suggestions-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 6px;
      margin-top: 14px;
      padding-top: 10px;
      border-top: 1px dashed #FED7AA;
    }

    .sugg-label {
      font-size: 0.75rem;
      font-weight: 700;
      color: var(--text-muted);
    }

    .sugg-chip {
      background: white;
      border: 1px solid #FED7AA;
      color: #9A3412;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 999px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .sugg-chip:hover {
      background: #FFEDD5;
    }

    /* Tarjeta de Encargado de Compras */
    .shopper-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: white;
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 14px 16px;
      margin-bottom: 16px;
      box-shadow: var(--shadow-sm);
    }

    .shopper-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .shopper-icon-box {
      font-size: 1.4rem;
      background: #FFF7ED;
      width: 40px;
      height: 40px;
      border-radius: 12px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .shopper-label {
      display: block;
      font-size: 0.72rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .shopper-person {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 2px;
    }

    .shopper-avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      object-fit: cover;
    }

    .shopper-name {
      font-size: 0.95rem;
      font-weight: 800;
      color: var(--text-main);
    }

    .no-shopper-text {
      font-size: 0.9rem;
      color: var(--text-light);
      font-style: italic;
    }

    .btn-change-shopper {
      background: #F8FAFC;
      border: 1px solid var(--border-color);
      color: var(--primary);
      font-weight: 700;
      font-size: 0.8rem;
      padding: 6px 14px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .btn-change-shopper:hover {
      background: var(--primary-light);
      border-color: var(--primary);
    }

    .shopper-selector-box {
      background: white;
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 14px 16px;
      margin-bottom: 20px;
      box-shadow: var(--shadow-sm);
    }

    .picker-hint {
      display: block;
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--text-muted);
      margin-bottom: 10px;
    }

    .shopper-chips-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .shopper-person-chip {
      display: flex;
      align-items: center;
      gap: 6px;
      background: #F8FAFC;
      border: 1.5px solid var(--border-color);
      padding: 6px 12px;
      border-radius: 999px;
      cursor: pointer;
      font-weight: 700;
      font-size: 0.85rem;
      color: var(--text-main);
      transition: all 0.15s ease;
    }

    .shopper-person-chip.active {
      background: #FFF7ED;
      border-color: #EA580C;
      color: #EA580C;
      box-shadow: 0 2px 6px rgba(234, 88, 12, 0.2);
    }

    .chip-avatar {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      object-fit: cover;
    }

    .item-text-group {
      display: flex;
      flex-direction: column;
    }

    .item-buyer-tag {
      font-size: 0.72rem;
      color: var(--text-muted);
      margin-top: 1px;
    }

    .item-buyer-tag strong {
      color: #EA580C;
    }

    .form-sublabel {
      display: block;
      font-size: 0.8rem;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 4px;
    }

    .form-select {
      width: 100%;
      padding: 10px 12px;
      border-radius: 10px;
      border: 1px solid var(--border-color);
      font-size: 0.9rem;
      font-family: inherit;
      background: white;
      font-weight: 600;
    }

    .section-items-header h4 {
      font-size: 0.9rem;
      font-weight: 700;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 12px;
    }

    .total-col {
      display: flex;
      flex-direction: column;
    }

    .total-label {
      font-size: 0.8rem;
      color: var(--text-muted);
      font-weight: 600;
    }

    .total-val {
      font-size: 1.5rem;
      font-weight: 900;
      color: var(--text-main);
      letter-spacing: -0.5px;
    }
  `]
})
export class DinnerMenuComponent {
  auth = inject(AuthService);
  state = inject(EventStateService);
  private router = inject(Router);

  isEditingTitle = signal<boolean>(false);
  tempDinnerTitle = '';

  showShopperSelector = signal<boolean>(false);

  showAddForm = signal<boolean>(false);
  newItemName = '';
  newItemAmount = 0;
  newItemBuyerId: string | undefined = undefined;

  currentShopper = computed(() => {
    const shopperId = this.state.currentEvent().dinnerShopperPlayerId;
    return shopperId ? this.state.getPlayer(shopperId) : undefined;
  });

  getItemBuyer(item: any) {
    if (item.buyerPlayerId) {
      return this.state.getPlayer(item.buyerPlayerId);
    }
    // Si no tiene comprador explícito pero hay un encargado de compras general asignado
    return this.currentShopper();
  }

  async setShopper(playerId: string) {
    if (!this.state.canEditDinner()) return;
    if (await this.state.updateDinnerShopper(playerId)) this.showShopperSelector.set(false);
  }

  startEditTitle() {
    if (!this.state.canEditDinner()) return;
    this.tempDinnerTitle = this.state.currentEvent().dinnerTitle || '';
    this.isEditingTitle.set(true);
  }

  async saveTitle() {
    if (!this.state.canEditDinner()) return;
    if (this.tempDinnerTitle.trim()) {
      if (await this.state.updateDinnerTitle(this.tempDinnerTitle.trim())) this.isEditingTitle.set(false);
    }
  }

  selectSuggestion(title: string) {
    if (!this.state.canEditDinner()) return;
    this.tempDinnerTitle = title;
    this.saveTitle();
  }

  removeItem(id: string) {
    if (!this.state.canEditDinner()) return;
    this.state.removeMenuItem(id);
  }

  async confirmAddItem() {
    if (!this.state.canEditDinner()) return;
    if (!this.newItemName.trim() || !Number.isFinite(this.newItemAmount) || this.newItemAmount <= 0) return;
    if (!await this.state.addMenuItem(this.newItemName, this.newItemAmount, '🍽️', this.newItemBuyerId)) return;
    this.newItemName = '';
    this.newItemAmount = 0;
    this.newItemBuyerId = undefined;
    this.showAddForm.set(false);
  }

  goBack() {
    this.router.navigate(['/']);
  }
}


