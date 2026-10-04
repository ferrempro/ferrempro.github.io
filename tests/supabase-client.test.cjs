const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');

function buildHarness({restoredSession=null,signedInSession=null,refreshedSession=null,refreshError=null}={}) {
  let createOptions=null;
  const requests=[];
  let resolveInitialSession;
  const initialSessionPromise=new Promise(resolve=>{resolveInitialSession=resolve;});

  const ctx={
    console,
    setTimeout:(fn)=>fn(),
    clearTimeout:()=>{},
    Headers,
    fetch:async(input,init={})=>{
      const url=typeof input==='string'?input:input.url;
      const headers=new Headers(init.headers||{});
      requests.push({url,authorization:headers.get('authorization')});
      return {ok:true,status:200};
    }
  };
  ctx.window=ctx;
  ctx.REMPRO_SUPABASE_CONFIG={
    projectRef:'rvjjnkrojkpepbcxvevl',
    url:'https://rvjjnkrojkpepbcxvevl.supabase.co',
    publishableKey:'sb_publishable_test'
  };
  const auth={
    getSession:()=>initialSessionPromise,
    onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),
    signInWithPassword:async()=>({
      data:{session:signedInSession||{access_token:'user-jwt',refresh_token:'refresh',user:{id:'u1',email:'test@example.test'}}},
      error:null
    }),
    refreshSession:async()=> refreshError
      ? {data:{session:null},error:refreshError}
      : {data:{session:refreshedSession||{access_token:'fresh-jwt',refresh_token:'refresh-2',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u1',email:'test@example.test'}}},error:null},
    signOut:async()=>({error:null})
  };
  ctx.supabase={
    createClient:(_url,_key,options)=>{
      createOptions=options;
      return {auth};
    }
  };

  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../supabase-client.js'),'utf8'),ctx);

  return {
    ctx,
    requests,
    resolveInitialSession:(session=restoredSession)=>resolveInitialSession({data:{session}}),
    get options(){return createOptions;}
  };
}

test('Windows data requests force the active user JWT over the publishable key',async()=>{
  const h=buildHarness();
  await h.ctx.RemProSupabase.signIn('test@example.test','secret');
  await h.options.global.fetch(
    'https://rvjjnkrojkpepbcxvevl.supabase.co/rest/v1/rpc/rempro_is_member',
    {headers:{Authorization:'Bearer sb_publishable_test'}}
  );
  assert.equal(h.requests.at(-1).authorization,'Bearer user-jwt');
  h.resolveInitialSession(null);
});

test('late empty session restore does not erase a just-completed sign-in',async()=>{
  const h=buildHarness();
  await h.ctx.RemProSupabase.signIn('test@example.test','secret');
  h.resolveInitialSession(null);
  await Promise.resolve();
  assert.equal(h.ctx.RemProSupabase.session.access_token,'user-jwt');
});

test('auth endpoints are not rewritten with the user JWT by the custom fetch',async()=>{
  const h=buildHarness();
  await h.ctx.RemProSupabase.signIn('test@example.test','secret');
  await h.options.global.fetch(
    'https://rvjjnkrojkpepbcxvevl.supabase.co/auth/v1/token',
    {headers:{Authorization:'Bearer sb_publishable_test'}}
  );
  assert.equal(h.requests.at(-1).authorization,'Bearer sb_publishable_test');
  h.resolveInitialSession(null);
});


test('expired JWT is refreshed before a PostgREST request',async()=>{
  const expired={access_token:'expired-jwt',refresh_token:'refresh',expires_at:Math.floor(Date.now()/1000)-10,user:{id:'u1',email:'test@example.test'}};
  const fresh={access_token:'fresh-jwt',refresh_token:'refresh-2',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u1',email:'test@example.test'}};
  const h=buildHarness({signedInSession:expired,refreshedSession:fresh});
  await h.ctx.RemProSupabase.signIn('test@example.test','secret');
  await h.options.global.fetch(
    'https://rvjjnkrojkpepbcxvevl.supabase.co/rest/v1/rpc/rempro_is_member',
    {headers:{Authorization:'Bearer sb_publishable_test'}}
  );
  assert.equal(h.requests.at(-1).authorization,'Bearer fresh-jwt');
  assert.equal(h.ctx.RemProSupabase.session.access_token,'fresh-jwt');
  h.resolveInitialSession(null);
});

test('invalid refresh token asks for reauthentication instead of sending stale JWT',async()=>{
  const expired={access_token:'expired-jwt',refresh_token:'bad',expires_at:Math.floor(Date.now()/1000)-10,user:{id:'u1',email:'test@example.test'}};
  const h=buildHarness({signedInSession:expired,refreshError:{code:'refresh_token_not_found',message:'Invalid Refresh Token'}});
  await h.ctx.RemProSupabase.signIn('test@example.test','secret');
  await assert.rejects(
    ()=>h.options.global.fetch('https://rvjjnkrojkpepbcxvevl.supabase.co/rest/v1/rpc/rempro_is_member',{}),
    /Vuelve a iniciar sesión/
  );
  assert.equal(h.ctx.RemProSupabase.session,null);
  assert.equal(h.requests.some(r=>r.authorization==='Bearer expired-jwt'),false);
  h.resolveInitialSession(null);
});
