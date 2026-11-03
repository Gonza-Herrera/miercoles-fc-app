import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { EventStateService } from '../../services/event-state.service';
@Component({standalone:true,selector:'app-cancel-event',imports:[FormsModule,RouterLink],template:`
 <header class="header-bar"><a routerLink="/" aria-label="Volver al inicio" class="back">‹</a><strong>Cancelar evento</strong><span aria-hidden="true">⚽</span></header>
 <main><h1>{{state.currentEvent().title}}</h1>
 @if(state.canCancelEvent() && state.currentEvent().id===eventId){
 <section class="card"><h2>¿Se suspende esta fecha?</h2><p>Solo se puede cancelar antes de iniciar el partido.</p>
 <label for="cancel-reason">Motivo de la cancelación</label><textarea id="cancel-reason" rows="4" maxlength="300" [(ngModel)]="reason" [disabled]="review() || state.saving() || state.canRetry()" placeholder="Por ejemplo: mal clima o faltan jugadores"></textarea>
 <small>{{reason.length}}/300 caracteres</small>
 @if(!review()){<button class="btn btn-primary full" [disabled]="reason.trim().length<3 || state.saving() || state.canRetry()" (click)="review.set(true)">Revisar cancelación</button>}
 @else{<div class="review" role="alert"><h2>Confirmar cancelación</h2><p>{{reason.trim()}}</p><p>Se cerrarán las confirmaciones del partido y de la cena. Se conservarán los registros, pero esta fecha no contará como realizada. No se podrá reabrir.</p>
 <div class="actions"><button class="btn btn-secondary" [disabled]="state.saving() || state.canRetry()" (click)="review.set(false)">Volver</button><button class="btn danger" [disabled]="state.saving() || state.canRetry()" (click)="cancel()">Sí, cancelar evento</button></div></div>}
 </section>
 }@else{<section class="card"><p>Este evento ya cambió de etapa o fue reemplazado. La cancelación solo está disponible antes de iniciar el partido.</p><a class="btn btn-secondary full" routerLink="/">Volver al inicio</a></section>}
 @if(state.error()){<p class="error" role="alert">{{state.error()}}</p>}
 @if(state.canRetry()){<button class="btn btn-primary full" [disabled]="state.saving()" (click)="state.retryLastSave()">Reintentar la misma cancelación</button>}
 <button class="btn btn-secondary full" [disabled]="state.saving()" (click)="refresh()">Actualizar evento</button>
 </main>`,styles:[`
 :host{display:block;min-height:100vh;background:var(--bg-app)}.back{font-size:2rem;text-decoration:none;color:var(--text-main)}main{padding:22px 18px calc(var(--bottom-nav-height) + 24px)}h1{font-size:1.4rem}h2{font-size:1.1rem;margin-bottom:12px}p{line-height:1.5;margin:12px 0;color:var(--text-muted)}.card{background:white;border:1px solid var(--border-color);border-radius:20px;padding:20px;margin-top:20px}label{display:block;font-weight:700;font-size:.85rem;margin:20px 0 10px}textarea{display:block;width:100%;max-width:100%;min-width:0;box-sizing:border-box;padding:12px;font:inherit;font-size:16px;border:1px solid var(--border-color);border-radius:12px;resize:vertical;background:white;color:var(--text-main)}small{display:block;margin-top:8px;color:var(--text-muted)}.full{width:100%;min-height:44px;margin-top:16px}.actions{display:flex;gap:10px;flex-wrap:wrap}.actions button{flex:1;min-height:44px}.review{margin-top:20px;padding-top:20px;border-top:1px solid var(--border-color)}.danger{background:#be123c;color:white}.error{color:#be123c}button:disabled{opacity:.5}
 `]})
export class CancelEventComponent {
 readonly state=inject(EventStateService);private router=inject(Router);
 readonly eventId=this.state.currentEvent().id;
 private version=this.state.getEventVersion();
 readonly review=signal(false);reason='';
 async cancel(){if(await this.state.cancelEvent(this.reason,this.eventId,this.version))await this.router.navigate(['/']);}
 async refresh(){await this.state.refreshAfterError();this.version=this.state.getEventVersion();this.review.set(false);}
}
