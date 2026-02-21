import { motion } from "framer-motion";

// Hero illustration: character with dashboard
export const HeroIllustration = () => (
  <svg viewBox="0 0 500 400" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
    {/* Background shapes */}
    <circle cx="250" cy="200" r="160" fill="hsl(357 75% 52% / 0.06)" />
    <circle cx="250" cy="200" r="120" fill="hsl(357 75% 52% / 0.04)" />
    
    {/* Dashboard screen */}
    <rect x="140" y="60" width="220" height="160" rx="12" fill="hsl(215 20% 15%)" />
    <rect x="140" y="60" width="220" height="28" rx="12" fill="hsl(215 20% 20%)" />
    <circle cx="156" cy="74" r="4" fill="hsl(0 72% 51%)" />
    <circle cx="170" cy="74" r="4" fill="hsl(38 92% 50%)" />
    <circle cx="184" cy="74" r="4" fill="hsl(142 71% 45%)" />
    
    {/* Chart bars */}
    <rect x="160" y="170" width="20" height="30" rx="3" fill="hsl(357 75% 52% / 0.6)" />
    <rect x="185" y="150" width="20" height="50" rx="3" fill="hsl(357 75% 52% / 0.8)" />
    <rect x="210" y="130" width="20" height="70" rx="3" fill="hsl(357 75% 52%)" />
    <rect x="235" y="145" width="20" height="55" rx="3" fill="hsl(357 75% 52% / 0.7)" />
    <rect x="260" y="120" width="20" height="80" rx="3" fill="hsl(357 75% 52% / 0.9)" />
    <rect x="285" y="105" width="20" height="95" rx="3" fill="hsl(357 75% 52%)" />
    <rect x="310" y="115" width="20" height="85" rx="3" fill="hsl(357 75% 52% / 0.75)" />
    
    {/* Funnel icon floating */}
    <g transform="translate(380, 70)">
      <motion.g
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      >
        <rect width="50" height="50" rx="10" fill="hsl(357 75% 52% / 0.12)" />
        <path d="M15 18h20l-6 10v6l-8-4v-2l-6-10z" fill="hsl(357 75% 52%)" />
      </motion.g>
    </g>
    
    {/* Person character */}
    <g transform="translate(60, 180)">
      {/* Body */}
      <rect x="15" y="60" width="50" height="70" rx="8" fill="hsl(357 75% 52%)" />
      {/* Head */}
      <circle cx="40" cy="40" r="25" fill="hsl(30 60% 70%)" />
      {/* Hair */}
      <path d="M18 30c0-14 10-22 22-22s22 8 22 22c0 2-1 3-2 4 0-12-8-20-20-20s-20 8-20 20c-1-1-2-2-2-4z" fill="hsl(215 20% 20%)" />
      {/* Eyes */}
      <circle cx="32" cy="38" r="3" fill="hsl(215 20% 15%)" />
      <circle cx="48" cy="38" r="3" fill="hsl(215 20% 15%)" />
      {/* Smile */}
      <path d="M32 48c4 4 12 4 16 0" stroke="hsl(215 20% 15%)" strokeWidth="2" strokeLinecap="round" fill="none" />
      {/* Arms */}
      <rect x="65" y="68" width="40" height="12" rx="6" fill="hsl(30 60% 70%)" transform="rotate(-15 65 68)" />
      <rect x="-25" y="75" width="40" height="12" rx="6" fill="hsl(30 60% 70%)" transform="rotate(15 -25 75)" />
      {/* Legs */}
      <rect x="20" y="128" width="16" height="40" rx="8" fill="hsl(215 30% 40%)" />
      <rect x="44" y="128" width="16" height="40" rx="8" fill="hsl(215 30% 40%)" />
    </g>
    
    {/* Floating elements */}
    <g transform="translate(100, 260)">
      <motion.g
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
      >
        <rect width="40" height="40" rx="8" fill="hsl(142 71% 45% / 0.15)" />
        <path d="M12 20l6 6 12-12" stroke="hsl(142 71% 45%)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </motion.g>
    </g>
    
    <g transform="translate(370, 170)">
      <motion.g
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      >
        <rect width="45" height="45" rx="10" fill="hsl(200 70% 55% / 0.15)" />
        <circle cx="22" cy="16" r="7" fill="hsl(200 70% 55%)" />
        <circle cx="14" cy="16" r="7" fill="hsl(200 70% 55% / 0.7)" />
        <circle cx="30" cy="16" r="7" fill="hsl(200 70% 55% / 0.7)" />
        <rect x="8" y="26" width="28" height="3" rx="1.5" fill="hsl(200 70% 55% / 0.5)" />
        <rect x="12" y="32" width="20" height="3" rx="1.5" fill="hsl(200 70% 55% / 0.3)" />
      </motion.g>
    </g>
  </svg>
);

// Pain point: lost leads
export const LostLeadsIcon = () => (
  <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-16 h-16">
    <rect width="80" height="80" rx="16" fill="hsl(357 75% 52% / 0.1)" />
    <g transform="translate(16, 16)">
      <rect x="4" y="8" width="28" height="22" rx="4" fill="hsl(357 75% 52% / 0.3)" />
      <rect x="16" y="18" width="28" height="22" rx="4" fill="hsl(357 75% 52% / 0.5)" />
      <path d="M30 29l8 8M38 29l-8 8" stroke="hsl(357 75% 52%)" strokeWidth="2.5" strokeLinecap="round" />
    </g>
  </svg>
);

// Pain point: no funnel visibility
export const BrokenFunnelIcon = () => (
  <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-16 h-16">
    <rect width="80" height="80" rx="16" fill="hsl(38 92% 50% / 0.1)" />
    <g transform="translate(18, 16)">
      <path d="M4 8h36l-10 16v10l-16-8v-2L4 8z" fill="hsl(38 92% 50% / 0.4)" stroke="hsl(38 92% 50%)" strokeWidth="2" strokeDasharray="4 3" />
      <path d="M18 28l6-6" stroke="hsl(357 75% 52%)" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="32" cy="20" r="8" fill="hsl(357 75% 52% / 0.2)" stroke="hsl(357 75% 52%)" strokeWidth="2" />
      <path d="M30 18l4 4M34 18l-4 4" stroke="hsl(357 75% 52%)" strokeWidth="2" strokeLinecap="round" />
    </g>
  </svg>
);

// Pain point: disorganized team
export const DisorganizedTeamIcon = () => (
  <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-16 h-16">
    <rect width="80" height="80" rx="16" fill="hsl(270 60% 55% / 0.1)" />
    <g transform="translate(14, 18)">
      <circle cx="14" cy="12" r="8" fill="hsl(270 60% 55% / 0.4)" />
      <circle cx="38" cy="12" r="8" fill="hsl(270 60% 55% / 0.4)" />
      <circle cx="26" cy="28" r="8" fill="hsl(270 60% 55% / 0.6)" />
      <path d="M8 36l8-4M44 36l-8-4" stroke="hsl(270 60% 55%)" strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" />
      <text x="22" y="32" fontSize="12" fill="hsl(270 60% 55%)" fontWeight="bold">?</text>
    </g>
  </svg>
);

// Solution: Pipeline
export const PipelineIllustration = () => (
  <svg viewBox="0 0 400 280" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
    <rect width="400" height="280" rx="16" fill="hsl(215 25% 95%)" />
    {/* Column headers */}
    {["Novo", "Contato", "Proposta", "Ganho"].map((label, i) => (
      <g key={label} transform={`translate(${20 + i * 95}, 20)`}>
        <rect width="85" height="24" rx="6" fill={`hsl(357 75% 52% / ${0.15 + i * 0.15})`} />
        <text x="42" y="16" textAnchor="middle" fontSize="10" fill="hsl(215 20% 15%)" fontWeight="600">{label}</text>
      </g>
    ))}
    {/* Cards */}
    {[0, 1, 2, 3].map((col) => 
      [0, 1, 2].slice(0, 3 - col).map((row) => (
        <g key={`${col}-${row}`} transform={`translate(${20 + col * 95}, ${54 + row * 60})`}>
          <rect width="85" height="50" rx="8" fill="white" stroke="hsl(215 20% 88%)" strokeWidth="1" />
          <rect x="8" y="10" width="40" height="6" rx="3" fill="hsl(215 20% 80%)" />
          <rect x="8" y="22" width="55" height="4" rx="2" fill="hsl(215 20% 90%)" />
          <rect x="8" y="32" width="30" height="4" rx="2" fill="hsl(215 20% 90%)" />
          <circle cx="70" cy="38" r="8" fill={`hsl(357 75% 52% / ${0.2 + col * 0.2})`} />
        </g>
      ))
    )}
    {/* Arrow */}
    <path d="M130 160h30M225 140h30M320 120h30" stroke="hsl(357 75% 52% / 0.4)" strokeWidth="2" strokeDasharray="4 4" markerEnd="url(#arrow)" />
    <defs>
      <marker id="arrow" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
        <path d="M0 0l8 3-8 3z" fill="hsl(357 75% 52% / 0.4)" />
      </marker>
    </defs>
  </svg>
);

// Solution: Team management
export const TeamIllustration = () => (
  <svg viewBox="0 0 400 280" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
    <rect width="400" height="280" rx="16" fill="hsl(215 25% 95%)" />
    {/* Podium */}
    <rect x="140" y="140" width="50" height="90" rx="4" fill="hsl(38 92% 50% / 0.3)" />
    <rect x="80" y="170" width="50" height="60" rx="4" fill="hsl(215 20% 75% / 0.5)" />
    <rect x="200" y="180" width="50" height="50" rx="4" fill="hsl(200 70% 55% / 0.3)" />
    {/* Podium numbers */}
    <text x="165" y="200" textAnchor="middle" fontSize="20" fill="hsl(38 92% 50%)" fontWeight="bold">1</text>
    <text x="105" y="210" textAnchor="middle" fontSize="18" fill="hsl(215 20% 50%)" fontWeight="bold">2</text>
    <text x="225" y="215" textAnchor="middle" fontSize="16" fill="hsl(200 70% 55%)" fontWeight="bold">3</text>
    {/* Person 1 (gold) */}
    <circle cx="165" cy="115" r="20" fill="hsl(30 60% 70%)" />
    <path d="M148 105c0-10 7-17 17-17s17 7 17 17" fill="hsl(215 20% 20%)" />
    <circle cx="159" cy="114" r="2.5" fill="hsl(215 20% 15%)" />
    <circle cx="171" cy="114" r="2.5" fill="hsl(215 20% 15%)" />
    <path d="M159 121c3 3 9 3 12 0" stroke="hsl(215 20% 15%)" strokeWidth="1.5" strokeLinecap="round" fill="none" />
    {/* Person 2 */}
    <circle cx="105" cy="148" r="17" fill="hsl(30 50% 65%)" />
    <circle cx="99" cy="147" r="2" fill="hsl(215 20% 15%)" />
    <circle cx="111" cy="147" r="2" fill="hsl(215 20% 15%)" />
    {/* Person 3 */}
    <circle cx="225" cy="158" r="17" fill="hsl(30 55% 72%)" />
    <circle cx="219" cy="157" r="2" fill="hsl(215 20% 15%)" />
    <circle cx="231" cy="157" r="2" fill="hsl(215 20% 15%)" />
    {/* Stats panel */}
    <rect x="270" y="40" width="110" height="190" rx="10" fill="white" stroke="hsl(215 20% 88%)" strokeWidth="1" />
    <text x="285" y="65" fontSize="10" fill="hsl(215 20% 15%)" fontWeight="600">Comissões</text>
    <rect x="285" y="80" width="80" height="8" rx="4" fill="hsl(215 25% 95%)" />
    <rect x="285" y="80" width="60" height="8" rx="4" fill="hsl(142 71% 45% / 0.5)" />
    <rect x="285" y="100" width="80" height="8" rx="4" fill="hsl(215 25% 95%)" />
    <rect x="285" y="100" width="45" height="8" rx="4" fill="hsl(200 70% 55% / 0.5)" />
    <rect x="285" y="120" width="80" height="8" rx="4" fill="hsl(215 25% 95%)" />
    <rect x="285" y="120" width="30" height="8" rx="4" fill="hsl(38 92% 50% / 0.5)" />
    <text x="285" y="155" fontSize="10" fill="hsl(215 20% 15%)" fontWeight="600">Meta mensal</text>
    <text x="285" y="175" fontSize="22" fill="hsl(142 71% 45%)" fontWeight="bold">78%</text>
    <rect x="285" y="190" width="80" height="10" rx="5" fill="hsl(215 25% 95%)" />
    <rect x="285" y="190" width="62" height="10" rx="5" fill="hsl(142 71% 45% / 0.6)" />
  </svg>
);

// Solution: Dashboard metrics
export const DashboardIllustration = () => (
  <svg viewBox="0 0 400 280" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
    <rect width="400" height="280" rx="16" fill="hsl(215 25% 95%)" />
    {/* Metric cards */}
    <rect x="20" y="20" width="110" height="60" rx="8" fill="white" stroke="hsl(215 20% 88%)" strokeWidth="1" />
    <text x="32" y="42" fontSize="9" fill="hsl(215 15% 50%)">Receita do mês</text>
    <text x="32" y="62" fontSize="16" fill="hsl(142 71% 45%)" fontWeight="bold">R$ 47.8k</text>
    
    <rect x="145" y="20" width="110" height="60" rx="8" fill="white" stroke="hsl(215 20% 88%)" strokeWidth="1" />
    <text x="157" y="42" fontSize="9" fill="hsl(215 15% 50%)">Ticket médio</text>
    <text x="157" y="62" fontSize="16" fill="hsl(200 70% 55%)" fontWeight="bold">R$ 2.350</text>
    
    <rect x="270" y="20" width="110" height="60" rx="8" fill="white" stroke="hsl(215 20% 88%)" strokeWidth="1" />
    <text x="282" y="42" fontSize="9" fill="hsl(215 15% 50%)">Conversão</text>
    <text x="282" y="62" fontSize="16" fill="hsl(357 75% 52%)" fontWeight="bold">34.2%</text>
    
    {/* Line chart */}
    <rect x="20" y="95" width="240" height="160" rx="8" fill="white" stroke="hsl(215 20% 88%)" strokeWidth="1" />
    <text x="32" y="118" fontSize="10" fill="hsl(215 20% 15%)" fontWeight="600">Vendas (últimos 7 dias)</text>
    <polyline
      points="40,220 70,200 100,210 130,180 160,170 190,150 220,140"
      stroke="hsl(357 75% 52%)"
      strokeWidth="2.5"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <polygon
      points="40,220 70,200 100,210 130,180 160,170 190,150 220,140 220,240 40,240"
      fill="hsl(357 75% 52% / 0.08)"
    />
    {[40, 70, 100, 130, 160, 190, 220].map((x, i) => (
      <circle key={i} cx={x} cy={[220, 200, 210, 180, 170, 150, 140][i]} r="3" fill="hsl(357 75% 52%)" />
    ))}
    
    {/* Pie chart */}
    <rect x="275" y="95" width="105" height="160" rx="8" fill="white" stroke="hsl(215 20% 88%)" strokeWidth="1" />
    <text x="287" y="118" fontSize="10" fill="hsl(215 20% 15%)" fontWeight="600">Fontes</text>
    <circle cx="327" cy="180" r="40" fill="none" stroke="hsl(357 75% 52%)" strokeWidth="20" strokeDasharray="80 171" />
    <circle cx="327" cy="180" r="40" fill="none" stroke="hsl(200 70% 55%)" strokeWidth="20" strokeDasharray="50 201" strokeDashoffset="-80" />
    <circle cx="327" cy="180" r="40" fill="none" stroke="hsl(38 92% 50%)" strokeWidth="20" strokeDasharray="40 211" strokeDashoffset="-130" />
    <circle cx="327" cy="180" r="40" fill="none" stroke="hsl(142 71% 45%)" strokeWidth="20" strokeDasharray="31 220" strokeDashoffset="-170" />
  </svg>
);

// Features tab illustrations
export const LeadsTabIllustration = () => (
  <svg viewBox="0 0 360 240" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
    <rect width="360" height="240" rx="12" fill="hsl(215 25% 95%)" />
    {/* Lead cards list */}
    {[0, 1, 2, 3].map((i) => (
      <g key={i} transform={`translate(20, ${20 + i * 52})`}>
        <rect width="320" height="44" rx="8" fill="white" stroke="hsl(215 20% 88%)" strokeWidth="1" />
        <circle cx="28" cy="22" r="14" fill={`hsl(${[357, 200, 142, 38][i]} ${[75, 70, 71, 92][i]}% ${[52, 55, 45, 50][i]}% / 0.2)`} />
        <rect x="52" y="12" width="80" height="7" rx="3" fill="hsl(215 20% 75%)" />
        <rect x="52" y="25" width="120" height="5" rx="2" fill="hsl(215 20% 88%)" />
        <rect x="240" y="14" width="50" height="18" rx="9" fill={`hsl(${[142, 38, 357, 200][i]} ${[71, 92, 75, 70][i]}% ${[45, 50, 52, 55][i]}% / 0.15)`} />
        <text x="265" y="27" textAnchor="middle" fontSize="8" fill={`hsl(${[142, 38, 357, 200][i]} ${[71, 92, 75, 70][i]}% ${[40, 45, 47, 50][i]}%)`} fontWeight="600">
          {["Novo", "Contato", "Proposta", "Ganho"][i]}
        </text>
      </g>
    ))}
  </svg>
);

export const AutomationTabIllustration = () => (
  <svg viewBox="0 0 360 240" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-auto">
    <rect width="360" height="240" rx="12" fill="hsl(215 25% 95%)" />
    {/* Flow nodes */}
    <rect x="130" y="20" width="100" height="36" rx="8" fill="hsl(357 75% 52% / 0.15)" stroke="hsl(357 75% 52%)" strokeWidth="1.5" />
    <text x="180" y="43" textAnchor="middle" fontSize="10" fill="hsl(357 75% 52%)" fontWeight="600">Lead criado</text>
    
    <line x1="180" y1="56" x2="180" y2="80" stroke="hsl(215 20% 75%)" strokeWidth="1.5" />
    <polygon points="176,78 180,86 184,78" fill="hsl(215 20% 75%)" />
    
    <rect x="110" y="86" width="140" height="36" rx="8" fill="hsl(38 92% 50% / 0.15)" stroke="hsl(38 92% 50%)" strokeWidth="1.5" />
    <text x="180" y="109" textAnchor="middle" fontSize="10" fill="hsl(38 80% 40%)" fontWeight="600">Verificar origem</text>
    
    <line x1="150" y1="122" x2="100" y2="150" stroke="hsl(215 20% 75%)" strokeWidth="1.5" />
    <line x1="210" y1="122" x2="260" y2="150" stroke="hsl(215 20% 75%)" strokeWidth="1.5" />
    
    <rect x="40" y="150" width="120" height="36" rx="8" fill="hsl(142 71% 45% / 0.15)" stroke="hsl(142 71% 45%)" strokeWidth="1.5" />
    <text x="100" y="173" textAnchor="middle" fontSize="9" fill="hsl(142 60% 35%)" fontWeight="600">Mover p/ Pipeline</text>
    
    <rect x="200" y="150" width="120" height="36" rx="8" fill="hsl(200 70% 55% / 0.15)" stroke="hsl(200 70% 55%)" strokeWidth="1.5" />
    <text x="260" y="173" textAnchor="middle" fontSize="9" fill="hsl(200 60% 40%)" fontWeight="600">Atribuir vendedor</text>
    
    <line x1="100" y1="186" x2="100" y2="210" stroke="hsl(215 20% 75%)" strokeWidth="1.5" />
    <line x1="260" y1="186" x2="260" y2="210" stroke="hsl(215 20% 75%)" strokeWidth="1.5" />
    
    <rect x="55" y="210" width="90" height="24" rx="6" fill="hsl(142 71% 45% / 0.3)" />
    <text x="100" y="226" textAnchor="middle" fontSize="8" fill="hsl(142 60% 30%)">✓ Automático</text>
    
    <rect x="215" y="210" width="90" height="24" rx="6" fill="hsl(200 70% 55% / 0.3)" />
    <text x="260" y="226" textAnchor="middle" fontSize="8" fill="hsl(200 60% 35%)">✓ Round-robin</text>
  </svg>
);
