// Identity is authoritative immediately; slow profile reads never sign the user out.
export function createProfileSession({load, identity, profile, unavailable, timeoutMs=10000}) {
  let user=null, epoch=0, pending=null, ready=false;
  function retry() {
    if(!user||ready||pending)return pending||Promise.resolve();
    const owner=user,revision=epoch;
    const task=(async()=>{
      let timer;
      try {
        const result=await Promise.race([Promise.resolve().then(()=>load(owner)), new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('profile_timeout')),timeoutMs);})]);
        if(revision!==epoch)return;
        ready=true;profile(owner,result);
      } catch {
        if(revision===epoch)unavailable(owner);
      } finally {clearTimeout(timer);if(revision===epoch)pending=null;}
    })();
    pending=task;return task;
  }
  return {
    change(next){epoch++;user=next;ready=false;pending=null;identity(next);return retry();},
    retry,
  };
}
