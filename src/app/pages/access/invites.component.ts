import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { GroupInvite, InvitesService } from '../../services/invites.service';
import { AuthService } from '../../services/auth.service';
@Component({standalone:true,selector:'app-invites',imports:[CommonModule,FormsModule,RouterLink],providers:[InvitesService],template:`
 <header class="header-bar"><a routerLink="/" class="back" aria-label="Volver al inicio">‹</a><strong>Administrar acceso</strong><span aria-hidden="true">🔐</span></header>
 <main><h1>Invitados al grupo</h1><p>Solo los correos autorizados pueden acceder con Google o Magic Link.</p>
 <section class="card"><h2>Agregar invitado</h2><form (ngSubmit)="add()"><fieldset [disabled]="data.loading()||data.saving()||data.canRetry()">
 <label>Nombre de referencia<input name="name" [(ngModel)]="name" required minlength="2" maxlength="60" placeholder="Nombre o apodo" /></label>
 <label>Correo autorizado<input type="email" name="email" [(ngModel)]="email" required maxlength="254" autocomplete="off" placeholder="amigo@gmail.com" /></label>
 <button class="btn btn-primary full" type="submit">Autorizar correo</button></fieldset></form><small>No envía un email. Compartí el enlace de la app y pedile que entre con este mismo correo.</small></section>
 <section class="card"><h2>Lista de acceso</h2><p>{{activeCount()}} autorizados · {{data.rows().length-activeCount()}} sin acceso</p>
 <label>Buscar<input type="search" [(ngModel)]="search" placeholder="Nombre o correo" /></label>
 @if(data.loading()){<p role="status">Cargando invitados…</p>}
 @for(row of filtered();track row.id){<article><strong>{{row.display_name}}</strong><span class="email">{{row.email}}</span>
 <span class="status" [class.active]="row.active">{{row.active?'Autorizado':'Sin acceso'}}</span>
 @if(!row.active&&row.user_id&&!row.first_access_at){<small>Cuenta existente · pendiente de aprobación</small>}
 <small>Primer ingreso autorizado: {{row.first_access_at ? (row.first_access_at | date:'dd/MM/yyyy HH:mm') : 'Sin registrar'}}</small>
 @if(row.email===auth.currentUser()?.email){<small>Tu cuenta de administrador conserva el acceso.</small>}
 @else{<div class="actions"><button class="btn" [class.btn-secondary]="row.active" [class.btn-primary]="!row.active" [disabled]="data.loading()||data.saving()||data.canRetry()" (click)="pending.set(row)">{{row.active?'Desactivar acceso':'Autorizar acceso'}}</button></div>}
 </article>}@empty{ @if(!data.loading()){<p>No hay resultados.</p>} }
 </section>
 @if(pending();as row){<div class="modal-backdrop"></div><section class="card review" role="dialog" aria-modal="true" aria-label="Confirmar cambio de acceso"><h2>{{row.active?'¿Desactivar este acceso?':'¿Autorizar este correo?'}}</h2><p>{{row.display_name}} · {{row.email}}</p>
 <p>{{row.active?'Se bloquearán las próximas consultas y acciones. Sus participaciones, pagos y estadísticas se conservarán.':'Podrá entrar al grupo usando este correo con Google o Magic Link.'}}</p>
 <div class="actions"><button class="btn btn-secondary" [disabled]="data.saving()||data.canRetry()" (click)="pending.set(null)">Cancelar</button><button class="btn btn-primary" [disabled]="data.saving()||data.canRetry()" (click)="confirm()">Confirmar</button></div></section>}
 @if(data.canRetry()){<button class="btn btn-primary full" [disabled]="data.saving()" (click)="retry()">Reintentar el mismo cambio</button>}
 <button class="btn btn-secondary full" [disabled]="data.loading()||data.saving()" (click)="refresh()">Actualizar lista</button>
 @if(data.saving()){<p role="status">Guardando acceso…</p>}
 </main>
 @if(feedback()){<div class="feedback" [class.error]="!!data.error()" role="status">{{data.error()||data.notice()}}</div>}
 `,styles:[`
 :host{display:block;background:var(--bg-app);min-height:100vh}.back{font-size:2rem;text-decoration:none;color:var(--text-main)}main{padding:22px 18px calc(var(--bottom-nav-height) + 24px)}h1{font-size:1.4rem}h2{font-size:1.1rem}p{line-height:1.5;color:var(--text-muted);margin:12px 0}.card{padding:20px;background:white;border:1px solid var(--border-color);border-radius:20px;margin-top:20px;min-width:0}fieldset{border:0;min-width:0;padding:0}label{display:block;margin:16px 0;font-size:.85rem;font-weight:700}input{display:block;width:100%;min-width:0;box-sizing:border-box;border:1px solid var(--border-color);border-radius:10px;background:white;color:var(--text-main);padding:12px;font:inherit;font-size:16px;margin-top:8px}small{display:block;line-height:1.5;color:var(--text-muted);margin-top:10px}.full{width:100%;min-height:44px;margin-top:14px}article{border-bottom:1px solid var(--border-color);padding:18px 0;overflow-wrap:anywhere}.email{display:block;font-size:.85rem;color:var(--text-muted);margin-top:8px}.status{display:inline-block;margin-top:12px;padding:5px 9px;border-radius:8px;background:#fff1f2;color:#9f1239;font-size:.75rem}.status.active{background:#ecfdf5;color:#065f46}.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}.actions button{flex:1;min-height:44px}.modal-backdrop{position:fixed;inset:0;background:#0f172a88;z-index:2090}.review{position:fixed;z-index:2100;left:50%;top:50%;transform:translate(-50%,-50%);width:calc(100% - 32px);max-width:440px;max-height:80vh;overflow:auto;background:var(--primary-light)}button:disabled{opacity:.5}.feedback{position:fixed;bottom:calc(var(--bottom-nav-height) + 12px);left:50%;transform:translateX(-50%);width:calc(100% - 32px);max-width:448px;padding:14px;z-index:1999;border-radius:12px;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}.feedback.error{background:#fff1f2;color:#9f1239;border-color:#fecdd3}
 `]})
export class InvitesComponent {
 readonly data=inject(InvitesService);readonly auth=inject(AuthService);readonly pending=signal<GroupInvite|null>(null);readonly feedback=signal(false);
 name='';email='';search='';
 readonly activeCount=computed(()=>this.data.rows().filter(r=>r.active).length);
 filtered(){const search=this.search.toLowerCase().trim();return this.data.rows().filter(r=>`${r.display_name} ${r.email}`.toLowerCase().includes(search));}
 constructor(){void this.data.load();effect(cleanup=>{const message=this.data.error()||this.data.notice();this.feedback.set(!!message);if(message){const timer=setTimeout(()=>this.feedback.set(false),3000);cleanup(()=>clearTimeout(timer));}});}
 async add(){if(await this.data.save(this.name,this.email,true)){this.name='';this.email='';}}
 async confirm(){const row=this.pending();if(row&&await this.data.save(row.display_name,row.email,!row.active,row))this.pending.set(null);}
 async retry(){if(await this.data.retry()){this.pending.set(null);this.name='';this.email='';}}
 async refresh(){this.pending.set(null);await this.data.refresh();}
}
