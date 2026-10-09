import { createClient } from 'npm:@supabase/supabase-js@2';
// Provider: Geoapify. Key is server-only. No calls to public Nominatim.
Deno.serve(async (req) => {
 const origin=Deno.env.get('APP_ORIGIN')??'https://kkodamalab.github.io';
 const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Vary':'Origin'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{headers});
 if(req.method!=='POST')return reply({error:'method not allowed'},405);
 if(req.headers.get('origin')&&req.headers.get('origin')!==origin)return reply({error:'origin not allowed'},403);
 const authorization=req.headers.get('authorization');if(!authorization)return reply({error:'login required'},401);
 const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}}});
 const {data:user,error}=await db.auth.getUser();if(error||!user.user)return reply({error:'login required'},401);
 let body;try{body=await req.json();}catch{return reply({error:'invalid JSON'},400);}
 const q=typeof body.query==='string'?body.query.trim():'';if(q.length<2||q.length>200)return reply({error:'invalid query'},400);
 const key=Deno.env.get('GEOAPIFY_API_KEY');if(!key)return reply({error:'provider is not configured'},503);
 const {error:quota}=await db.rpc('claim_geocode');if(quota)return reply({error:'search limit reached'},429);
 try{
 const url=new URL('https://api.geoapify.com/v1/geocode/search');url.search=new URLSearchParams({text:q,lang:'ja',limit:'5',format:'json',apiKey:key}).toString();
 const response=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!response.ok)return reply({error:'provider unavailable'},502);
 const data=await response.json();return reply((data.results??[]).map((r:{lat:number;lon:number;formatted:string})=>({lat:r.lat,lon:r.lon,display_name:r.formatted})));
 }catch{return reply({error:'search unavailable'},502);}
});
