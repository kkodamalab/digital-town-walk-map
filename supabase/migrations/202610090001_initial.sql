-- Run once in a fresh Supabase project. No service_role key belongs in the browser.
create extension if not exists pgcrypto;
create table public.profiles(id uuid primary key references auth.users on delete cascade, display_name text not null default '地域の利用者' check(length(display_name) between 1 and 100), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.user_roles(user_id uuid primary key references auth.users on delete cascade, role text not null check(role='admin'));
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from user_roles where user_id=auth.uid() and role='admin') $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;
create table public.places(id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users, name text not null check(length(name) between 1 and 200), lat double precision not null check(lat between -90 and 90), lng double precision not null check(lng between -180 and 180), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.contents(id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users, place_id uuid not null references places, title text not null check(length(title) between 1 and 200), description text not null check(length(description) between 1 and 3000), category text not null check(category in ('風景・歴史','専門家解説','住民インタビュー','観察記録','その他')), display_name text not null check(length(display_name) between 1 and 100), recorded_at timestamptz, credit text check(length(credit)<=200), consent boolean not null default false, visibility text not null default 'pending' check(visibility in ('pending','public','private')), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(category<>'住民インタビュー' or consent));
create table public.media_assets(id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users, content_id uuid not null references contents on delete cascade, path text unique not null, kind text not null check(kind in ('photo','video','audio')), name text not null check(length(name) between 1 and 200), created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.help_requests(id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users, title text not null check(length(title) between 1 and 200), description text not null check(length(description) between 1 and 3000), category text not null check(category in ('買い物・荷物運び','スマートフォン・デジタル支援','簡単な家事・暮らしの手伝い','地域活動','学び・交流','その他')), display_name text not null check(length(display_name) between 1 and 100), area text not null check(length(area) between 1 and 200), lat numeric(5,2) not null check(lat between -90 and 90), lng numeric(6,2) not null check(lng between -180 and 180), desired_at text not null check(length(desired_at) between 1 and 200), frequency text not null check(frequency in ('単発','継続')), reward text not null check(reward in ('無償','有償','応相談')), status text not null default '承認待ち' check(status in ('承認待ち','募集中','調整中','マッチング成立','完了','取消')), visibility text not null default 'pending' check(visibility in ('pending','public','private')), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(visibility<>'public' or status<>'承認待ち'));
create table public.help_applications(id uuid primary key default gen_random_uuid(), request_id uuid not null references help_requests on delete cascade, applicant_id uuid not null references auth.users, display_name text not null check(length(display_name) between 1 and 100), capability text not null check(length(capability) between 1 and 200), availability text not null check(length(availability) between 1 and 200), message text not null check(length(message) between 1 and 3000), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(request_id,applicant_id));
create table public.matches(id uuid primary key default gen_random_uuid(), request_id uuid unique not null references help_requests on delete cascade, application_id uuid unique not null references help_applications on delete cascade, admin_id uuid not null references auth.users, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table public.reports(id uuid primary key default gen_random_uuid(), reporter_id uuid not null references auth.users, content_id uuid references contents on delete cascade, request_id uuid references help_requests on delete cascade, reason text not null check(length(reason) between 1 and 3000), resolved boolean not null default false, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(num_nonnulls(content_id,request_id)=1));

-- No self-service administrator assignment. Read-only through RLS even for admins.
alter table profiles enable row level security;
alter table user_roles enable row level security;
alter table places enable row level security;
alter table contents enable row level security;
alter table media_assets enable row level security;
alter table help_requests enable row level security;
alter table help_applications enable row level security;
alter table matches enable row level security;
alter table reports enable row level security;
create policy profile_read on profiles for select using(id=auth.uid() or is_admin());
create policy profile_insert on profiles for insert to authenticated with check(id=auth.uid());
create policy profile_edit on profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy roles_read on user_roles for select to authenticated using(user_id=auth.uid() or is_admin());
create policy place_read on places for select using(owner_id=auth.uid() or is_admin() or exists(select 1 from contents c where c.place_id=places.id and c.visibility='public'));
create policy place_insert on places for insert to authenticated with check(owner_id=auth.uid());
-- Places are immutable to users: editing an approved location must never bypass review.
create policy content_read on contents for select using(visibility='public' or owner_id=auth.uid() or is_admin());
create policy content_insert on contents for insert to authenticated with check(owner_id=auth.uid() and visibility in ('pending','private') and exists(select 1 from places p where p.id=place_id));
create policy content_edit on contents for update to authenticated using(owner_id=auth.uid() or is_admin()) with check(owner_id=auth.uid() or is_admin());
create policy content_delete on contents for delete to authenticated using(owner_id=auth.uid() or is_admin());
create policy media_read on media_assets for select using(exists(select 1 from contents c where c.id=content_id));
create policy media_insert on media_assets for insert to authenticated with check(owner_id=auth.uid() and split_part(path,'/',1)=auth.uid()::text and split_part(path,'/',2)=content_id::text and exists(select 1 from contents c where c.id=content_id and c.owner_id=auth.uid() and c.visibility in ('pending','private')));
create policy media_delete on media_assets for delete to authenticated using(is_admin() or exists(select 1 from contents c where c.id=content_id and c.owner_id=auth.uid() and c.visibility<>'public'));
create policy help_read on help_requests for select using(visibility='public' or owner_id=auth.uid() or is_admin());
create policy help_insert on help_requests for insert to authenticated with check(owner_id=auth.uid() and visibility in ('pending','private') and status='承認待ち');
create policy help_edit on help_requests for update to authenticated using(owner_id=auth.uid() or is_admin()) with check(owner_id=auth.uid() or is_admin());
create policy help_delete on help_requests for delete to authenticated using(owner_id=auth.uid() or is_admin());
create policy application_read on help_applications for select to authenticated using(applicant_id=auth.uid() or is_admin());
create policy application_insert on help_applications for insert to authenticated with check(applicant_id=auth.uid() and exists(select 1 from help_requests h where h.id=request_id and h.visibility='public' and h.status='募集中' and h.owner_id<>auth.uid()));
-- Application withdrawal is not exposed in this version; matched applications remain intact.
-- Deleting a request still cascades its applications and matching records.
create policy match_read on matches for select to authenticated using(is_admin());
-- All match writes use confirm_match; no client write policy.
create policy report_read on reports for select to authenticated using(reporter_id=auth.uid() or is_admin());
create policy report_insert on reports for insert to authenticated with check(reporter_id=auth.uid() and not resolved and ((content_id is not null and exists(select 1 from contents where id=content_id)) or (request_id is not null and exists(select 1 from help_requests where id=request_id))));
create policy report_edit on reports for update to authenticated using(is_admin()) with check(is_admin());

create function public.guard_submission() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.owner_id<>old.owner_id or new.id<>old.id or new.created_at<>old.created_at then raise exception 'immutable ownership'; end if;
 if not is_admin() then
  if new.visibility='public' then raise exception 'admin approval required'; end if;
  if tg_table_name='help_requests' then
   if new.status not in ('承認待ち','取消') then raise exception 'admin status required'; end if;
  end if;
 end if;
 if tg_table_name='help_requests' then
  if new.status in ('マッチング成立','完了') and not exists(select 1 from matches where request_id=new.id) then raise exception 'confirm a match first'; end if;
  if new.status='完了' then update matches set completed_at=now() where request_id=new.id; end if;
 end if;
 new.updated_at=now();return new;
end $$;
create trigger content_guard before update on contents for each row execute function guard_submission();
create trigger help_guard before update on help_requests for each row execute function guard_submission();
create function public.touch_updated() returns trigger language plpgsql as $$ begin new.updated_at=now();return new;end $$;
create trigger profile_touch before update on profiles for each row execute function touch_updated();
create trigger report_touch before update on reports for each row execute function touch_updated();
create trigger match_touch before update on matches for each row execute function touch_updated();

create function public.confirm_match(application_id uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare app help_applications; req help_requests; result uuid;
begin
 if not is_admin() then raise exception 'admin only'; end if;
 select * into app from help_applications where id=application_id;
 if app.id is null then raise exception 'application not found'; end if;
 select * into req from help_requests where id=app.request_id for update;
 if req.status not in ('募集中','調整中') or req.visibility<>'public' then raise exception 'request not recruiting'; end if;
 insert into matches(request_id,application_id,admin_id) values(app.request_id,app.id,auth.uid()) returning id into result;
 update help_requests set status='マッチング成立' where id=app.request_id;
 return result;
end $$;
revoke all on function confirm_match(uuid) from public;
grant execute on function confirm_match(uuid) to authenticated;

-- Transactional per-user/day counters prevent parallel-insert rate-limit bypass.
create table public.daily_usage(user_id uuid not null references auth.users on delete cascade, day date not null, kind text not null, count integer not null default 0, primary key(user_id,day,kind));
alter table daily_usage enable row level security;
create function public.limit_submissions() returns trigger language plpgsql security definer set search_path=public as $$
declare n integer; actor uuid;
begin
 actor=auth.uid(); if actor is null then raise exception 'authentication required'; end if;
 insert into daily_usage(user_id,day,kind,count) values(actor,current_date,tg_table_name,1) on conflict(user_id,day,kind) do update set count=daily_usage.count+1 returning count into n;
 if n>20 then raise exception 'daily limit reached'; end if;
 return new;
end $$;
create trigger place_quota before insert on places for each row execute function limit_submissions();
create trigger content_quota before insert on contents for each row execute function limit_submissions();
create trigger help_quota before insert on help_requests for each row execute function limit_submissions();
create trigger application_quota before insert on help_applications for each row execute function limit_submissions();
create trigger report_quota before insert on reports for each row execute function limit_submissions();
create function public.limit_media() returns trigger language plpgsql security definer set search_path=public as $$
begin
 perform 1 from contents where id=new.content_id for update;
 if (select count(*) from media_assets where content_id=new.content_id)>=5 then raise exception 'maximum 5 files'; end if;
 return new;
end $$;
create trigger media_quota before insert on media_assets for each row execute function limit_media();

-- One PRIVATE bucket. Public access is conditional on DB approval; no permanent public URL.
-- This keeps approved media and pending media separated by policy, and supports withdrawal.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('town-media','town-media',false,26214400,array['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/x-m4a','audio/wav','audio/x-wav','audio/webm']);
create policy town_media_read on storage.objects for select using(bucket_id='town-media' and (is_admin() or exists(select 1 from media_assets m join contents c on c.id=m.content_id where m.path=storage.objects.name and (c.visibility='public' or c.owner_id=auth.uid()))));
create policy town_media_upload on storage.objects for insert to authenticated with check(bucket_id='town-media' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from contents c where c.id::text=(storage.foldername(name))[2] and c.owner_id=auth.uid() and c.visibility in ('pending','private')));
create policy town_media_delete on storage.objects for delete to authenticated using(bucket_id='town-media' and (is_admin() or ((storage.foldername(name))[1]=auth.uid()::text and not exists(select 1 from media_assets m join contents c on c.id=m.content_id where m.path=storage.objects.name and c.visibility='public'))));

create table public.geocode_gate(id integer primary key check(id=1), last_at timestamptz not null);
insert into geocode_gate values(1,'1970-01-01');
alter table geocode_gate enable row level security;
revoke all on geocode_gate from anon,authenticated;

-- Geocoding quota callable only with the logged-in user's JWT.
create function public.claim_geocode() returns void language plpgsql security definer set search_path=public as $$ declare n integer; last_call timestamptz;begin
 if auth.uid() is null then raise exception 'authentication required';end if;
 select last_at into last_call from geocode_gate where id=1 for update;
 if last_call>clock_timestamp()-interval '1 second' then raise exception 'search rate limit';end if;
 update geocode_gate set last_at=clock_timestamp() where id=1;
 insert into daily_usage(user_id,day,kind,count) values(auth.uid(),current_date,'geocode',1) on conflict(user_id,day,kind) do update set count=daily_usage.count+1 returning count into n;
 if n>30 then raise exception 'search daily limit reached';end if;
end $$;
revoke all on function claim_geocode() from public;
grant execute on function claim_geocode() to authenticated;

create index contents_place_idx on contents(place_id);
create index contents_owner_idx on contents(owner_id);
create index help_owner_idx on help_requests(owner_id);
create index media_content_idx on media_assets(content_id);
create index application_applicant_idx on help_applications(applicant_id);
-- Supabase default grants are narrowed explicitly, including future service tables.
grant usage on schema public to anon,authenticated;
grant select on profiles,user_roles,places,contents,media_assets,help_requests,help_applications,matches,reports to anon,authenticated;
grant insert,update,delete on profiles,places,contents,media_assets,help_requests,help_applications,reports to authenticated;
revoke all on daily_usage from anon,authenticated;
revoke insert,update,delete on user_roles,matches from anon,authenticated;
