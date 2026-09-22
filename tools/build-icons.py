"""CRDB original geometric symbols. Build: python (fonttools) tools/build-icons.py.
The font retains a compatibility cmap for old UI/API strings; new UI uses PUA names.
No OS emoji artwork, third-party icon paths, or game artwork is included.
"""
from pathlib import Path
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib.tables._c_m_a_p import CmapSubtable
import math,json
ROOT=Path(__file__).resolve().parent.parent
# 24-unit hand-drawn geometry: lines, closed outlines, filled polygons and circles.
L=lambda *p:('line',p)
O=lambda *p:('outline',p)
P=lambda *p:('fill',p)
C=lambda x,y,r:('circle',(x,y,r))
R=lambda x,y,r:('ring',(x,y,r))
icons={
'bolt':('⚡',[P((14,2),(5,14),(11,14),(9,22),(20,9),(13,9))]),
'crown':('👑',[O((3,7),(8,11),(12,4),(16,11),(21,7),(19,18),(5,18)),L((6,21),(18,21)),C(12,3,1)]),
'cup':('🏆',[O((7,3),(17,3),(17,10),(15,14),(9,14),(7,10)),L((7,5),(3,5),(3,9),(7,11)),L((17,5),(21,5),(21,9),(17,11)),L((12,14),(12,20)),L((7,21),(17,21))]),
'launch':('↗',[L((6,18),(18,6)),L((8,6),(18,6),(18,16))]),
'clover':('♧',[R(8,11,3.5),R(16,11,3.5),R(12,6,3.5),L((12,12),(12,21)),L((9,21),(15,21))]),
'cards':('🃏',[O((6,4),(19,4),(19,21),(6,21)),L((3,17),(3,2),(16,2)),P((12,8),(16,12),(12,16),(8,12))]),
'chart':('📊',[L((3,3),(3,21),(22,21)),P((6,13),(9,13),(9,18),(6,18)),P((12,8),(15,8),(15,18),(12,18)),P((18,4),(21,4),(21,18),(18,18))]),
'medal':('🏅🥇🥈🥉',[L((8,9),(5,2),(10,2),(12,7)),L((16,9),(19,2),(14,2),(12,7)),R(12,15,6),P((12,11),(14,15),(12,19),(10,15))]),
'flame':('🔥',[O((12,2),(13,8),(17,6),(20,14),(18,20),(12,22),(6,20),(4,14),(8,7),(8,13)),L((12,12),(10,17),(12,19),(15,17),(12,12))]),
'search':('🔍',[R(10,10,6.5),L((15,15),(21,21))]),
'person':('👤',[R(12,7,4),L((4,21),(5,17),(8,14),(16,14),(19,17),(20,21))]),
'star':('★',[O((12,2),(15,9),(22,10),(17,15),(18,22),(12,18),(6,22),(7,15),(2,10),(9,9))]),
'build':('🛠',[L((4,21),(18,7)),L((5,3),(13,3),(21,11),(18,14),(10,6),(5,6)),L((3,14),(10,21))]),
'flask':('🧪',[L((9,2),(15,2)),O((10,2),(10,9),(4,19),(5,22),(19,22),(20,19),(14,9),(14,2)),L((8,15),(16,15)),C(10,18,1),C(14,19,1)]),
'drop':('💧',[O((12,2),(5,12),(4,16),(6,20),(12,22),(18,20),(20,16),(19,12)),L((8,15),(9,18),(12,19))]),
'shield':('🛡',[O((12,2),(21,6),(20,15),(17,19),(12,22),(7,19),(4,15),(3,6)),L((8,12),(11,15),(17,9))]),
'key':('🔑',[R(8,8,5),L((12,12),(21,21)),L((16,16),(19,13)),L((19,19),(22,16))]),
'edit':('✎',[O((4,16),(16,4),(20,8),(8,20),(3,21)),L((13,7),(17,11))]),
'spark':('✨',[O((10,3),(12,10),(18,12),(12,14),(10,21),(8,14),(2,12),(8,10)),L((19,2),(19,7)),L((17,4.5),(21,4.5))]),
'theme':('🌗',[R(12,12,9),P((12,3),(17,5),(20,8),(21,12),(20,16),(17,19),(12,21))]),
'folder':('📁',[O((2,6),(9,6),(11,9),(22,9),(20,21),(3,21)),L((3,6),(3,3),(10,3),(13,6),(20,6))]),
'clipboard':('📋',[O((5,4),(19,4),(19,22),(5,22)),O((9,2),(15,2),(15,6),(9,6)),L((8,11),(16,11)),L((8,15),(16,15)),L((8,19),(13,19))]),
'compass':('🧭',[R(12,12,9),O((16,5),(14,14),(5,19),(9,9)),C(12,12,1)]),
'warning':('⚠',[O((12,2),(23,21),(1,21)),L((12,8),(12,14)),C(12,18,1)]),
'close':('❌',[L((5,5),(19,19)),L((19,5),(5,19))]),
'play':('▶',[P((6,3),(21,12),(6,21))]),
'pin':('📍',[O((12,22),(5,11),(5,6),(8,2),(16,2),(19,6),(19,11)),R(12,8,3)]),
'idea':('💡',[L((8,17),(8,14),(5,10),(5,6),(8,3),(16,3),(19,6),(19,10),(16,14),(16,17)),L((8,18),(16,18)),L((10,21),(14,21))]),
'check':('✅',[L((4,12),(10,18),(21,5))]),
'link':('🔗',[L((8,14),(4,14),(2,11),(2,7),(6,3),(10,3),(13,6),(13,10)),L((16,10),(20,10),(22,13),(22,17),(18,21),(14,21),(11,18),(11,14)),L((8,16),(16,8))]),
'heart':('♡❤',[O((12,21),(3,12),(2,8),(4,4),(8,3),(12,7),(16,3),(20,4),(22,8),(21,12))]),
'drag':('↔',[L((2,12),(22,12)),L((6,8),(2,12),(6,16)),L((18,8),(22,12),(18,16))]),
'seed':('🌱',[L((12,22),(12,12),(6,6)),O((12,13),(12,5),(17,2),(22,2),(21,7),(17,11)),O((11,13),(5,12),(2,8),(2,4),(6,4),(10,8))]),
'focus':('🎯',[R(12,12,9),R(12,12,5),C(12,12,1.8)]),
'eye':('👀',[O((2,12),(6,6),(12,4),(18,6),(22,12),(18,18),(12,20),(6,18)),R(12,12,4)]),
'info':('ℹ',[R(12,12,9),L((12,11),(12,18)),C(12,7,1)]),
'power':('💪',[P((13,2),(4,13),(10,13),(10,22),(21,10),(14,10))]),
'settings':('⚙',[R(12,12,6),R(12,12,2.5)]+[L((12+6*math.cos(i*math.pi/4),12+6*math.sin(i*math.pi/4)),(12+10*math.cos(i*math.pi/4),12+10*math.sin(i*math.pi/4))) for i in range(8)]),
'brain':('🧠',[L((12,3),(8,2),(5,5),(5,8),(2,10),(3,15),(6,16),(7,20),(12,22),(17,20),(18,16),(21,15),(22,10),(19,8),(19,5),(16,2),(12,3),(12,22)),L((5,8),(9,10),(8,14)),L((19,8),(15,10),(16,14))]),
'battle':('⚔',[L((3,2),(20,19)),L((21,2),(4,19)),L((13,17),(18,12)),L((6,12),(11,17)),L((2,21),(6,17)),L((18,17),(22,21))]),
'like':('👍',[O((9,21),(9,10),(13,2),(16,3),(16,10),(22,10),(20,21)),O((3,10),(6,10),(6,21),(3,21))]),
'research':('🔬',[L((5,22),(20,22)),L((12,17),(12,22)),L((8,17),(17,17),(21,13),(20,9)),O((8,2),(14,6),(9,14),(3,10)),L((15,3),(17,5))]),
'signal':('📡',[L((3,4),(4,12),(8,18),(16,21),(3,4)),L((11,20),(9,23),(18,23)),L((14,3),(18,4),(21,8),(22,12)),L((13,8),(16,9),(17,12)),C(11,13,1.5)]),
}
def circle(x,y,r,n=24):return [(x+r*math.cos(i*2*math.pi/n),y+r*math.sin(i*2*math.pi/n)) for i in range(n)]
def polygons(shapes):
 out=[]
 for kind,pts in shapes:
  if kind=='fill':out.append(list(pts));continue
  if kind=='circle':out.append(circle(*pts));continue
  if kind=='ring':x,y,r=pts;pts=circle(x,y,r);kind='outline'
  if kind=='outline':pts=list(pts)+[pts[0]]
  for a,b in zip(pts,pts[1:]):
   dx,dy=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dy)
   if not length:continue
   x,y=-dy/length*.78,dx/length*.78
   out.append([(a[0]+x,a[1]+y),(b[0]+x,b[1]+y),(b[0]-x,b[1]-y),(a[0]-x,a[1]-y)])
  out.extend(circle(x,y,.78,10) for x,y in pts)
 return out
font=FontBuilder(1024,isTTF=True);order=['.notdef']+list(icons);font.setupGlyphOrder(order);glyphs={};cmap={};metadata={};svgs=[]
for i,(name,(chars,shapes)) in enumerate(icons.items()):
 polys=polygons(shapes);pen=TTGlyphPen(None)
 for points in polys:
  # Consistent contour winding avoids cancelling overlap in the rasterizer.
  area=sum(a[0]*b[1]-b[0]*a[1] for a,b in zip(points,points[1:]+points[:1]))
  if area<0:points=points[::-1]
  mapped=[(round(x*38+56),round(880-y*38)) for x,y in points];pen.moveTo(mapped[0]);[pen.lineTo(p) for p in mapped[1:]];pen.closePath()
 glyphs[name]=pen.glyph();code=0xe000+i;cmap[code]=name
 for c in chars:cmap[ord(c)]=name
 metadata[name]={'codepoint':hex(code),'character':chr(code),'legacy':chars}
 path=' '.join('M'+' L'.join(f'{x:.3f},{y:.3f}' for x,y in ps)+' Z' for ps in polys)
 svgs.append(f'<symbol id="{name}" viewBox="0 0 24 24"><path d="{path}"/></symbol>')
pen=TTGlyphPen(None);glyphs['.notdef']=pen.glyph();font.setupGlyf(glyphs);font.setupCharacterMap(cmap);font.setupHorizontalMetrics({g:(1024,0) for g in order});font.setupHorizontalHeader(ascent=960,descent=-200);font.setupNameTable({'familyName':'CRDBSymbols','styleName':'Regular','uniqueFontIdentifier':'CRDBSymbols-1','fullName':'CRDBSymbols','psName':'CRDBSymbols','version':'Version 1.0'});font.setupOS2(sTypoAscender=960,sTypoDescender=-200,usWinAscent=1024,usWinDescent=240);font.setupPost()
uvs=CmapSubtable.newSubtable(14);uvs.platformID=0;uvs.platEncID=5;uvs.language=0;uvs.cmap={};uvs.uvsDict={0xfe0f:[(cp,None) for cp in cmap if cp<0xe000 or cp>0xf8ff]};font.font['cmap'].tables.append(uvs)
font.save(ROOT/'assets/icons/crdb-symbols.ttf');(ROOT/'assets/icons/symbols.svg').write_text('<svg xmlns="http://www.w3.org/2000/svg">'+''.join(svgs)+'</svg>');(ROOT/'assets/icons/manifest.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
ranges=','.join(f'U+{cp:X}' for cp in sorted(cmap))
(ROOT/'css/icons.css').write_text(f"/* Original CRDB geometry; legacy cmap prevents OS emoji fallback. */\n@font-face{{font-family:'CRDBSymbols';src:url('../assets/icons/crdb-symbols.ttf?v=260817') format('truetype');font-style:normal;font-weight:100 900;font-display:block;unicode-range:{ranges}}}\n.cr-icon{{font-family:'CRDBSymbols'!important;font-style:normal;font-weight:400;line-height:1}}\n")
with (ROOT/'css/icons.css').open('a') as out:
 for name,m in metadata.items():out.write('.cr-icon[data-icon="'+name+'"]::before{content:"\\'+m['codepoint'][2:]+'"}\n')
print(f'Built {len(icons)} original symbols; {len(cmap)} mappings; font {(ROOT/"assets/icons/crdb-symbols.ttf").stat().st_size} bytes')
