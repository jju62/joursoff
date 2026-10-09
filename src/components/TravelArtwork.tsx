export type TravelScene = 'coast' | 'lake' | 'mountains' | 'historic' | 'old-town' | 'city' | 'bridge' | 'christmas';

const SCENE_STYLES: Record<TravelScene, { background: string; foreground: string; accent: string }> = {
  coast: { background: 'from-sky-200 via-cyan-100 to-emerald-100', foreground: '#0e7490', accent: '#f97316' },
  lake: { background: 'from-sky-200 via-blue-100 to-teal-100', foreground: '#2563a6', accent: '#fbbf24' },
  mountains: { background: 'from-amber-100 via-orange-50 to-sky-200', foreground: '#427b76', accent: '#f59e0b' },
  historic: { background: 'from-orange-100 via-rose-50 to-sky-200', foreground: '#9a5361', accent: '#f59e0b' },
  'old-town': { background: 'from-rose-100 via-amber-50 to-sky-200', foreground: '#a45d51', accent: '#0f766e' },
  city: { background: 'from-violet-100 via-rose-50 to-sky-200', foreground: '#70527f', accent: '#d97706' },
  bridge: { background: 'from-emerald-100 via-sky-100 to-blue-200', foreground: '#4b7663', accent: '#f59e0b' },
  christmas: { background: 'from-slate-800 via-indigo-900 to-rose-900', foreground: '#f8fafc', accent: '#fbbf24' },
};

type TravelArtworkProps = {
  scene: TravelScene;
  label: string;
  className?: string;
};

export function TravelArtwork({ scene, label, className = '' }: TravelArtworkProps) {
  const style = SCENE_STYLES[scene];

  return (
    <div
      role="img"
      aria-label={`Illustration : ${label}`}
      className={`relative isolate h-28 overflow-hidden rounded-xl bg-gradient-to-br ${style.background} ${className}`}
    >
      <svg
        viewBox="0 0 640 240"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
        className="absolute inset-0 h-full w-full"
      >
        <circle cx="500" cy="54" r="28" fill={style.accent} opacity=".82" />
        <path d="M0 103c42-20 83-20 124 0 28-14 53-14 80 0 28-16 55-16 83 0v29H0z" fill="white" opacity=".42" />
        {scene === 'coast' && (
          <>
            <path d="M0 144 80 117l61 20 75-46 87 55 71-35 77 33 66-24 123 30v90H0z" fill="#5a9b8e" opacity=".8" />
            <path d="M0 163c72-19 125 18 198 0s132 18 205 0 152 18 237 0v77H0z" fill="#27a9b5" />
            <path d="M0 190c75-17 124 15 202 0s137 16 211 0 143 14 227 0" fill="none" stroke="white" strokeWidth="5" opacity=".55" />
            <path d="M90 138v-38l30-24 30 24v39m-49-39h38m-24 8v31m62-3v-54l35-29 35 29v57m-53-56h39m-28 12v44" fill="#fff4df" stroke="#965f50" strokeWidth="5" strokeLinejoin="round" />
            <path d="M116 83V54m116 28V45" stroke={style.accent} strokeWidth="6" />
          </>
        )}
        {scene === 'lake' && (
          <>
            <path d="m0 151 118-91 59 42 67-72 116 119 67-73 89 70 59-39 65 32v101H0z" fill="#648b99" />
            <path d="m0 151 118-91 59 42 67-72 76 78-43-8-39 14-60-23-65 44-51-5z" fill="#f7f4e8" opacity=".85" />
            <path d="M0 156c98-17 173 9 270 0s202-14 370 0v84H0z" fill="#3ca6b1" />
            <path d="M0 189c85-12 151 12 237 0s165-11 246 0 106 7 157 0" fill="none" stroke="white" strokeWidth="4" opacity=".55" />
            <path d="m89 174 45 0-23 20z" fill="#fff4df" /><path d="M111 169v25" stroke="#805b50" strokeWidth="3" />
          </>
        )}
        {scene === 'mountains' && (
          <>
            <path d="m0 176 118-119 48 48 94-89 125 153 86-106 169 122v55H0z" fill="#567f78" />
            <path d="m73 104 45-47 27 27-25-7-14 10-12-4zm139-3 48-85 42 54-24-9-17 8-16-9zm207 17 52-56 42 46-26-8-17 10-15-9z" fill="#f7f5e9" />
            <path d="M0 185c73-15 139 12 211 0s131 10 200 0 136 10 229 0v55H0z" fill="#96ad77" />
            <path d="M44 191v-27l15 27m-5 0v-37l18 37m410 0v-30l16 30m-7 0v-43l20 43m73 0v-26l14 26" fill="#355c54" />
          </>
        )}
        {scene === 'historic' && (
          <>
            <path d="M0 171h640v69H0z" fill="#b98c72" />
            <path d="M68 171v-66l34-26 34 26v66m-58-57h48m-24 0v57m146 0V92h126v79m-146-79 83-48 83 48m-94 25h22v31h-22zm43 0h22v31h-22zm42 0h22v31h-22zm83 36v-47l33-25 33 25v47m-57-43h48m-34 0v43" fill="#efd5b4" stroke="#875b50" strokeWidth="5" strokeLinejoin="round" />
            <path d="M318 43V21m-11 12h22" stroke={style.accent} strokeWidth="5" />
            <path d="M0 211h640" stroke="#fff1d4" strokeWidth="4" opacity=".7" />
          </>
        )}
        {scene === 'old-town' && (
          <>
            <path d="M0 152 91 121l82 22 88-40 80 45 79-28 89 32 74-23 57 18v73H0z" fill="#6d9990" opacity=".8" />
            <path d="M54 157v-54l38-29 38 29v54m-64-49h52m-36 1v48m57 0V88l39-33 41 33v69m-65-66h49m-31 1v65m108 0V95l37-28 39 28v62m-61-62h47m-31 3v59" fill="#f3d4ad" stroke="#9b6254" strokeWidth="5" strokeLinejoin="round" />
            <path d="M0 176c93-14 179 12 266 0s164 10 235 0 91 5 139 0v64H0z" fill="#48a9ad" />
            <path d="M0 203c85-11 167 10 247 0s163-9 239 0 104 4 154 0" fill="none" stroke="white" strokeWidth="4" opacity=".58" />
          </>
        )}
        {scene === 'city' && (
          <>
            <path d="M0 151h640v89H0z" fill="#9d846e" />
            <path d="M66 151V91h85v60m-75-48h18v18H76zm35 0h18v18h-18zm-35 29h18v18H76zm35 0h18v18h-18zm68 11V72h91v79m-80-65h19v18h-19zm37 0h19v18h-19zm-37 31h19v18h-19zm37 0h19v18h-19zm74 14V99h73v52m-62-39h16v16h-16zm32 0h16v16h-16zm68 14V79h93v72m-82-58h19v18h-19zm39 0h19v18h-19zm-39 33h19v18h-19zm39 0h19v18h-19zm105 0V99h54v52" fill="#f3d4ad" stroke="#8b6356" strokeWidth="4" strokeLinejoin="round" />
            <path d="M0 188c105-14 186 8 275 0s167 7 251 0 77 3 114 0" fill="none" stroke="#f6dfc2" strokeWidth="5" opacity=".8" />
          </>
        )}
        {scene === 'bridge' && (
          <>
            <path d="M0 143 96 91l76 42 82-66 90 83 68-48 86 42 73-32 69 31v97H0z" fill="#82a88b" />
            <path d="M0 169c89-15 157 14 243 0s160 14 239 0 109 10 158 0v71H0z" fill="#45a7ad" />
            <path d="M83 161c23-61 57-61 80 0m85 0c23-61 57-61 80 0m84 0c23-61 57-61 80 0" fill="none" stroke="#e8d2a9" strokeWidth="13" />
            <path d="M57 157h409v17H57z" fill="#d9bb8e" />
            <path d="M72 153c28-51 66-51 94 0m67 0c28-51 66-51 94 0m66 0c28-51 66-51 94 0" fill="none" stroke="#a77a5f" strokeWidth="7" />
            <path d="M0 194c89-12 157 12 243 0s160 12 239 0 109 8 158 0" fill="none" stroke="white" strokeWidth="4" opacity=".55" />
          </>
        )}
        {scene === 'christmas' && (
          <>
            <path d="M0 172h640v68H0z" fill="#26364d" />
            <path d="M55 171v-67l42-32 42 32v67m-72-53h60m-30 0v53m126 0V94h116v77m-132-77 74-47 74 47m-85 26h22v33h-22zm42 0h22v33h-22zm42 0h22v33h-22zm91 38v-61l38-29 38 29v61m-63-53h50m-38 0v53" fill="#eacfa8" stroke="#9b6654" strokeWidth="5" strokeLinejoin="round" />
            <path d="M358 30v30m-11-20 11 7 11-7m-11 20-9 12h18z" fill="#fbbf24" stroke="#fbbf24" strokeWidth="4" strokeLinejoin="round" />
            <path d="M468 171V91m-43 80 43-66 43 66m-69-38h52m-38-21 25 0m-44 40h63" fill="none" stroke="#166534" strokeWidth="10" strokeLinejoin="round" />
            <circle cx="453" cy="129" r="5" fill="#ef4444" /><circle cx="481" cy="137" r="5" fill="#fbbf24" />
            <circle cx="467" cy="111" r="5" fill="#f8fafc" /><circle cx="445" cy="151" r="5" fill="#f8fafc" />
            <path d="M516 171v-35l30-22 30 22v35m-54-20h48m-30 0v20" fill="#b94f45" stroke="#f6d6ae" strokeWidth="4" strokeLinejoin="round" />
            <path d="M520 137h52m-40-18v52m29-52v52" stroke="#fbbf24" strokeWidth="3" />
            <path d="M0 190c84-17 139 15 220 0s140 15 218 0 133 13 202 0" fill="none" stroke="#f8fafc" strokeWidth="4" opacity=".75" />
            <g fill="#fff" opacity=".88">
              <circle cx="48" cy="31" r="3" /><circle cx="147" cy="55" r="2.5" /><circle cx="223" cy="25" r="3" />
              <circle cx="293" cy="67" r="2.5" /><circle cx="412" cy="42" r="3" /><circle cx="581" cy="59" r="2.5" />
              <circle cx="617" cy="24" r="3" /><circle cx="176" cy="83" r="2" /><circle cx="390" cy="91" r="2.5" />
            </g>
          </>
        )}
      </svg>
      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/60 to-transparent px-3 pb-2 pt-8 text-xs font-extrabold text-white">
        {label}
      </span>
      <span className="absolute right-2 top-2 rounded-full bg-white/80 px-2 py-1 text-[9px] font-bold text-slate-700 backdrop-blur-sm">
        Escapade
      </span>
    </div>
  );
}
