import { Injectable, inject, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
export interface GroupInvite {
 id:string; email:string; display_name:string; active:boolean; user_id:string|null;
 created_at:string; updated_at:string; first_access_at:string|null; version:number;
}
@Injectable()
export class InvitesService {
 private client=inject(SupabaseService).client;
 readonly rows=signal<GroupInvite[]>([]); readonly loading=signal(false); readonly saving=signal(false);
 readonly error=signal<string|null>(null); readonly notice=signal<string|null>(null); readonly canRetry=signal(false);
 private attempt?:{p_id:string;p_version:number;p_name:string;p_email:string;p_active:boolean;p_operation:string};
 async load() {
   if(this.saving())return;
   this.loading.set(true); this.error.set(null);
   try {
     const rows:GroupInvite[]=[];
     for(let offset=0;;offset+=200){
       const {data,error}=await this.client.from('group_invites').select('*').order('created_at').order('id').range(offset,offset+199).abortSignal(AbortSignal.timeout(15000));
       if(error)throw error; rows.push(...(data??[]));if((data?.length??0)<200)break;
     }
     this.rows.set(rows);
   }catch{this.error.set('No pudimos cargar los invitados. Intentá nuevamente.');}finally{this.loading.set(false);}
 }
 save(name:string,email:string,active:boolean,invite?:GroupInvite):Promise<boolean>{
   if(this.saving()||this.canRetry())return Promise.resolve(false);
   if(name.trim().length<2||name.trim().length>60||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email.trim())||email.trim().length>254){this.error.set('Ingresá un nombre de 2 a 60 caracteres y un correo válido.');return Promise.resolve(false);}
   this.attempt={p_id:invite?.id??crypto.randomUUID(),p_version:invite?.version??-1,p_name:name.trim(),p_email:email.trim().toLowerCase(),p_active:active,p_operation:crypto.randomUUID()};
   return this.persist();
 }
 retry(){return this.canRetry()?this.persist():Promise.resolve(false);}
 async refresh(){this.canRetry.set(false);this.attempt=undefined;await this.load();}
 private async persist():Promise<boolean>{
   if(this.saving()||!this.attempt)return false;
   this.saving.set(true);this.error.set(null);this.notice.set(null);this.canRetry.set(false);
   try{
     const {data,error}=await this.client.rpc('save_group_invite',this.attempt).abortSignal(AbortSignal.timeout(15000));
     if(error)throw error;if(!data?.[0])throw new Error('Sin confirmación');
     const row=data[0] as GroupInvite;
     this.rows.update(rows=>rows.some(r=>r.id===row.id)?rows.map(r=>r.id===row.id?row:r):[...rows,row]);
     this.attempt=undefined;this.notice.set('Acceso actualizado');return true;
   }catch(error:any){
     this.canRetry.set(!error?.code);
     this.error.set(error?.code==='40001'?'El acceso cambió en otra sesión. Actualizá antes de continuar.':error?.code==='23505'?'Ese correo ya está en la lista. Actualizá para revisar su acceso.':error?.code?'No pudimos guardar la invitación. Revisá los datos.':'No pudimos confirmar el guardado. Reintentá el mismo cambio o actualizá la lista.');return false;
   }finally{this.saving.set(false);}
 }
}
