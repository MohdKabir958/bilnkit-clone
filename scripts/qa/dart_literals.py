from pathlib import Path
import json,re
# Dart lexical string reader; skips comments, recursively skips interpolation code.
def literals(s):
 n=len(s);out=[]
 def code(i,end=False):
  depth=0
  while i<n:
   if s.startswith('//',i):
    j=s.find('\n',i);i=n if j<0 else j+1;continue
   if s.startswith('/*',i):
    j=s.find('*/',i+2);i=n if j<0 else j+2;continue
   if s[i] in "'\"":i=string(i);continue
   if end:
    if s[i]=='{':depth+=1
    if s[i]=='}':
     if depth==0:return i+1
     depth-=1
   i+=1
  return i
 def string(i):
  raw=i>0 and s[i-1]=='r' and (i<2 or not s[i-2].isalnum());q=s[i]*3 if s.startswith(s[i]*3,i) else s[i];i+=len(q);start=i
  while i<n:
   if s.startswith(q,i):out.append((start,i,s[start:i]));return i+len(q)
   if not raw and s[i]=='\\':i+=2;continue
   if not raw and s.startswith('${',i):out.append((start,i,s[start:i]));i=code(i+2,True);start=i;continue
   i+=1
  return i
 code(0);return out
