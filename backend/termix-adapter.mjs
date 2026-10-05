// Runs inside the pinned Termix server. Control travels only over Node IPC.
import bcrypt from 'bcryptjs';
import {randomUUID} from 'node:crypto';
import {AuthManager} from './utils/auth-manager.js';
import {issueSession} from './auth/session-issuer.js';
import {DatabaseSaveTrigger} from './utils/database-save-trigger.js';
import {resetUserPassword} from './database/routes/user-password-reset-routes.js';
import {createCurrentUserRepository,createCurrentRoleRepository,createCurrentHostRepository,createCurrentSettingsRepository,createCurrentUserPreferenceRepository} from './database/repositories/factory.js';

async function credentials({userId,username,password}) {
  if(typeof username!=='string'||!/^[\p{L}\p{N}_.@-]{1,64}$/u.test(username))throw Error('Invalid username');
  if(typeof password!=='string'||password.length<6||!/[a-zA-Z]/.test(password)||!/[0-9]/.test(password))throw Error('Password must contain at least 6 characters, including letters and numbers');
  const users=createCurrentUserRepository(),auth=AuthManager.getInstance();
  const user=userId?await users.findById(userId):null;
  const conflict=await users.findByUsername(username);
  if(conflict&&conflict.id!==user?.id)throw Error('Username already exists');
  let id;
  if(userId&&!user)throw Error('Configured account is missing; refusing to replace it');
  if(user) {
    if(!await auth.unlockWithSystemKey(user.id))throw Error('Cannot unlock account data; no data was deleted');
    const result=await resetUserPassword(auth,{userId:user.id,username:user.username,newPassword:password,confirmDataWipe:false});
    if(result.status!=='reset'||result.dataWiped)throw Error('Password reset requires data recovery');
    await users.update(user.id,{username});id=user.id;
  } else {
    if((await users.listAll()).length)throw Error('Database already has users; refusing to claim an existing account');
    id=randomUUID();
    await users.createFirstLocalUser({id,username,passwordHash:await bcrypt.hash(password,12),isOidc:false,clientId:'',clientSecret:'',issuerUrl:'',authorizationUrl:'',tokenUrl:'',identifierPath:'',namePath:'',scopes:'openid email profile'});
    await createCurrentRoleRepository().assignRoleNameToUser({userId:id,roleName:'admin',grantedBy:id});
    await auth.registerUser(id);
  }
  await DatabaseSaveTrigger.forceSave('framely_credentials');return {userId:id,username};
}
async function language({userId,language}) {
  const settings=createCurrentSettingsRepository();
  const prefs=createCurrentUserPreferenceRepository();
  const old=await settings.get('framely_default_language');
  const user=userId?await prefs.findByUserId(userId):null;
  if(userId&&(!user?.language||user.language===old))await prefs.upsert(userId,{language});
  await settings.set('framely_default_language',language);
  await DatabaseSaveTrigger.forceSave('framely_language');return true;
}
async function seedHost({userId,username,key}) {
  const auth=AuthManager.getInstance();if(!await auth.unlockWithSystemKey(userId))throw Error('Cannot unlock Frame credentials');
  const hosts=createCurrentHostRepository();
  if(await hosts.existsForImportIdentity(userId,'127.0.0.1',22,username))return true;
  await hosts.createEncryptedForUser(userId,{userId,name:'Frame',ip:'127.0.0.1',port:22,username,authType:'key',key,keyType:'ssh-ed25519',connectionType:'ssh',folder:'',tags:'["Frame"]',pin:true});
  await DatabaseSaveTrigger.forceSave('framely_frame_host');return true;
}
async function windowLogin({userId}) {
  const user=await createCurrentUserRepository().findById(userId);
  const auth=AuthManager.getInstance();
  if(!user||!await auth.unlockWithSystemKey(userId))throw Error('Cannot unlock window account');
  const headers={'user-agent':'Termix-Desktop/Framely (Linux aarch64)'};
  const req={headers,ip:'127.0.0.1',socket:{remoteAddress:'127.0.0.1'},get:name=>headers[name.toLowerCase()]};
  const session=await issueSession(req,user,{rememberMe:false,methodId:'framely-window'});
  await DatabaseSaveTrigger.forceSave('framely_window_login');
  return {token:session.token,maxAge:session.maxAge,username:user.username};
}
export function install() {
  let queue=Promise.resolve();
  process.on('message',msg=>{
    if(!Number.isSafeInteger(msg?.id))return;
    queue=queue.then(async()=>{
      try {
        const handlers={'credentials.set':credentials,'language.set':language,'frame.seed':seedHost,'window.login':windowLogin};
        if(!handlers[msg.method])throw Error('Unknown control method');
        process.send?.({id:msg.id,result:await handlers[msg.method](msg.params??{})});
      }catch(e){process.send?.({id:msg.id,error:e.message});}
    });
  });
  process.send?.({ready:true});
}
