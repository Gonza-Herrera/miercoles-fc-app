import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { GroupAccessService } from '../../services/group-access.service';
@Component({standalone:true,selector:'app-access-denied',template:`
 <main><div class="card"><span aria-hidden="true">🔒</span><h1>Acceso al grupo</h1>
 @if(access.status()==='error'){<p>No pudimos comprobar tu acceso. Revisá la conexión e intentá nuevamente.</p>}
 @else if(access.status()==='checking'){<p role="status">Comprobando acceso…</p>}
 @else{<p>Esta cuenta no tiene acceso. Contactá al administrador para que autorice tu correo.</p>}
 <p class="email">{{auth.session()?.user?.email}}</p>
 <button class="btn btn-primary" (click)="retry()">Volver a comprobar</button>
 <button class="btn btn-secondary" (click)="auth.signOut()">Usar otra cuenta</button>
 </div></main>`,styles:[`main{min-height:100vh;display:grid;place-items:center;background:var(--bg-app);padding:24px}.card{width:100%;max-width:440px;padding:28px;border:1px solid var(--border-color);border-radius:22px;background:white;text-align:center}.card>span{font-size:2rem}h1{font-size:1.4rem;margin:18px 0}p{line-height:1.6;color:var(--text-muted);margin:14px 0}.email{overflow-wrap:anywhere}button{width:100%;margin-top:14px;min-height:44px}`]})
export class AccessDeniedComponent { readonly auth=inject(AuthService);readonly access=inject(GroupAccessService);private router=inject(Router);async retry(){if(await this.access.check())await this.router.navigate(['/']);} }
