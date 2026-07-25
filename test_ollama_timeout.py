import urllib.request,json,time
t0=time.time()
body=json.dumps({'provider':'ollama','model':'gemma4:e4b','messages':[{'role':'user','content':'Say hi'}]}).encode()
req=urllib.request.Request('http://localhost:8546/v1/ai/hermes-llm',data=body,headers={'Content-Type':'application/json'})
try:
    resp=urllib.request.urlopen(req,timeout=120)
    print('Time:',round(time.time()-t0,1),'s')
    print(resp.read().decode()[:300])
except Exception as e:
    print('Time:',round(time.time()-t0,1),'s')
    print('Error:',e)
