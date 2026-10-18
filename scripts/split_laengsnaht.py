"""Einmalig: Längsnaht-Code aus der App-Datei in ein eigenes Mitglieder-Modul verschieben."""
import re,sys
src='public/schnittkraftrechner/index.html'
s=open(src,encoding='utf-8').read()
lines=s.split('\n')
# Skriptbereich (Hauptskript)
start=next(i for i,l in enumerate(lines) if l=='<script>' and i>340)
end=next(i for i in range(start+1,len(lines)) if lines[i].startswith('</script>'))
# 1) calc + formula von PROC.laengsnaht herauslösen
i0=next(i for i in range(start,end) if lines[i].startswith(' laengsnaht:{name:'))
i1=next(i for i in range(i0+1,end) if lines[i].startswith(' kurbelwelle:{'))
blk=lines[i0:i1]
fi=next(i for i,l in enumerate(blk) if l.startswith('  formula:'))
ci=next(i for i,l in enumerate(blk) if l.startswith('  calc(f){'))
assert ci==fi+1
formula=blk[fi].strip().rstrip(',')
calc='\n'.join(blk[ci:])
assert calc.rstrip().endswith('}},')
calc=calc.rstrip()[:-2]  # "}}," -> "}" (Ende calc), Objekt-Klammer bleibt im Hauptteil
calc_fn=calc.strip()
assert calc_fn.startswith('calc(f){')
newblk=blk[:fi]+["  formula:'',","  calc(f){return {};}},"]
lines[i0:i1]=newblk
end=next(i for i in range(start+1,len(lines)) if lines[i].startswith('</script>'))
# 2) Top-Level-Anweisungen verschieben
pat=re.compile(r"^(function ln[A-Z]\w*\(|const ln[A-Z]\w*\s*=|const LN_\w+|let LN_\w+|document\.addEventListener\('(pointermove|pointerleave|pointerout)',|document\.addEventListener\('click',e=>\{const b=e\.target\.closest\('\[data-lnview\])")
def is_top(l):
    return l and not l[0].isspace() and not l.startswith('}') and not l.startswith(')') and not l.startswith(']')
moved=[];keep=[];i=start+1
out_main=lines[:start+1]
pending=[]  # Kommentarzeilen vor einer Anweisung
while i<end:
    l=lines[i]
    if is_top(l):
        j=i+1
        while j<end and not is_top(lines[j]): j+=1
        stmt=lines[i:j]
        if l.startswith('/*') or l.startswith('//'):
            # Kommentarblock: gehört zur nächsten Anweisung
            pending+=stmt;i=j;continue
        if pat.match(l):
            moved+=pending+stmt
        else:
            out_main+=pending+stmt
        pending=[];i=j;continue
    out_main.append(l);i+=1
out_main+=pending
out_main+=lines[end:]
main='\n'.join(out_main)
mod=["/* cuttingforce.app – Längsnahtfräsen (nur für angemeldete Benutzer). Wird vom Worker nur mit gültiger Sitzung ausgeliefert. */",
     "'use strict';"]+moved+[
     "PROC.laengsnaht.formula="+formula.split(':',1)[1]+";",
     "PROC.laengsnaht."+calc_fn.replace('calc(f){','calc=function(f){',1)+";",
     "window.LN_READY=true;",
     "if(typeof render==='function'){try{renderHeader();render();}catch(e){}}"]
open('src/member/laengsnaht.js','w',encoding='utf-8').write('\n'.join(mod)+'\n')
open(src,'w',encoding='utf-8').write(main)
print('moved lines',len(moved))
