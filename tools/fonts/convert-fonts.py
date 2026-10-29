"""Converts OFL fonts (TrueType) into three.js typeface JSON for text-sketch.html.

Usage, from the repo root:
  pip install fonttools skia-pathops
  # put the TTFs in tools/fonts/ttf/ (from github.com/google/fonts, ofl/<family>/):
  #   ibmplexmono/IBMPlexMono-Italic.ttf, jost/Jost[wght].ttf (save as jost_Jost-VF.ttf),
  #   dmserifdisplay/DMSerifDisplay-Regular.ttf
  python3 tools/fonts/convert-fonts.py
Writes vendor/fonts/typeface/*.typeface.json. Variable fonts are instanced with overlaps
removed, and outlines are turned clockwise, so counters (p, o, B) stay open in three.js.
"""
import os
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.join(HERE,'..','..')
import json,sys
from fontTools.ttLib import TTFont
from fontTools.pens.basePen import BasePen
from fontTools.varLib import instancer
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.pens.areaPen import AreaPen
class P(BasePen):
    def __init__(s,gs):
        super().__init__(gs); s.o=[]
    def r(s,v): return str(round(v))
    def _moveTo(s,p): s.o+=['m',s.r(p[0]),s.r(p[1])]
    def _lineTo(s,p): s.o+=['l',s.r(p[0]),s.r(p[1])]
    def _qCurveToOne(s,c,p): s.o+=['q',s.r(p[0]),s.r(p[1]),s.r(c[0]),s.r(c[1])]
    def _curveToOne(s,c1,c2,p): s.o+=['b',s.r(p[0]),s.r(p[1]),s.r(c1[0]),s.r(c1[1]),s.r(c2[0]),s.r(c2[1])]
    def _closePath(s): pass
def conv(path,out,family,weight=None,style='normal'):
    f=TTFont(path)
    if weight is not None and 'fvar' in f:
        f=instancer.instantiateVariableFont(f,{'wght':weight},overlap=instancer.OverlapMode.REMOVE)
    gs=f.getGlyphSet(); cmap=f.getBestCmap(); hm=f['hmtx']
    chars=[chr(c) for c in range(32,127)]+list("£€éèêáàâíóôúüçñöäß’‘“”–—…·×")
    ap=AreaPen(gs); gs[cmap[ord('o')]].draw(ap)
    flip = ap.value > 0  # outer contours must run clockwise for three.js
    glyphs={}
    for ch in chars:
        g=cmap.get(ord(ch))
        if not g: continue
        pen=P(gs); gs[g].draw(ReverseContourPen(pen) if flip else pen)
        xs=[float(v) for i,v in enumerate(pen.o) if False]
        adv=hm[g][0]
        b=f['glyf'][g] if 'glyf' in f else None
        try: xmin=b.xMin; xmax=b.xMax
        except Exception: xmin=0; xmax=adv
        glyphs[ch]={'ha':adv,'x_min':xmin,'x_max':xmax,'o':' '.join(pen.o)}
    head=f['head']; post=f['post']; hhea=f['hhea']
    data={'glyphs':glyphs,'familyName':family,'ascender':hhea.ascent,'descender':hhea.descent,
      'underlinePosition':post.underlinePosition,'underlineThickness':post.underlineThickness,
      'boundingBox':{'yMin':head.yMin,'xMin':head.xMin,'yMax':head.yMax,'xMax':head.xMax},
      'resolution':head.unitsPerEm,'original_font_information':{'licence':'SIL Open Font License 1.1 (see OFL.txt)'},
      'cssFontWeight':'bold' if (weight or 400)>=600 else 'normal','cssFontStyle':style}
    json.dump(data,open(out,'w'),separators=(',',':'))
    print(out,len(glyphs))
OUT=os.path.join(ROOT,'vendor','fonts','typeface'); TTF=os.path.join(HERE,'ttf'); os.makedirs(OUT,exist_ok=True)
conv(os.path.join(TTF,'ibmplexmono_IBMPlexMono-Italic.ttf'),os.path.join(OUT,'ibm-plex-mono-italic.typeface.json'),'IBM Plex Mono',None,'italic')
conv(os.path.join(TTF,'jost_Jost-VF.ttf'),os.path.join(OUT,'jost-bold.typeface.json'),'Jost',700)
conv(os.path.join(TTF,'jost_Jost-VF.ttf'),os.path.join(OUT,'jost-black.typeface.json'),'Jost',900)
conv(os.path.join(TTF,'dmserifdisplay_DMSerifDisplay-Regular.ttf'),os.path.join(OUT,'dm-serif-display.typeface.json'),'DM Serif Display')
