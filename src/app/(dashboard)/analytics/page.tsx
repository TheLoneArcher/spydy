'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Activity, CheckCircle, Clock, AlertTriangle, Users } from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [{ data: reports }, { data: tasks }, { data: vols }] = await Promise.all([
        supabase.from('reports').select('id, status, severity, created_at'),
        supabase.from('tasks').select('*'),
        supabase.from('volunteer_profiles').select('on_duty'),
      ]);

      const r = reports ?? [];
      const t = tasks ?? [];
      const v = vols ?? [];

      // Resolution trend — six four-hour buckets covering the last 24 hours.
      const buckets: Record<string, { new: number; resolved: number }> = {};
      const now = Date.now();
      const hours = Array.from({ length: 6 }, (_, i) => {
        const start = new Date(now - (5 - i) * 4 * 3600000);
        const key = `${start.getHours().toString().padStart(2, '0')}:00`;
        buckets[key] = { new: 0, resolved: 0 };
        return key;
      });
      r.forEach((rep: any) => {
        const age = now - new Date(rep.created_at).getTime();
        const bucket = Math.floor(age / (4 * 3600000));
        const key = hours[Math.max(0, Math.min(5, 5 - bucket))];
        if (key && age >= 0 && age < 24 * 3600000) buckets[key].new++;
      });
      t.filter((x: any) => x.status === 'completed' && x.updated_at).forEach((task: any) => {
        const age = now - new Date(task.updated_at).getTime();
        const bucket = Math.floor(age / (4 * 3600000));
        const key = hours[Math.max(0, Math.min(5, 5 - bucket))];
        if (key && age >= 0 && age < 24 * 3600000) buckets[key].resolved++;
      });

      const trend = Object.entries(buckets).map(([time, vals]) => ({ time, ...vals }));

      const completedTasks = t.filter((x: any) => x.status === 'completed' && x.updated_at && x.assigned_at);
      const avgMin = completedTasks.length
        ? completedTasks.reduce((acc: number, x: any) => acc + (new Date(x.updated_at).getTime() - new Date(x.assigned_at).getTime()) / 60000, 0) / completedTasks.length
        : 0;

      setData({
        totalReports: r.length,
        activeReports: r.filter((x: any) => !['closed', 'resolved_pending_confirmation'].includes(x.status)).length,
        resolved: r.filter((x: any) => ['closed', 'resolved_pending_confirmation'].includes(x.status)).length,
        critical: r.filter((x: any) => x.severity === 'critical' && !['closed', 'resolved_pending_confirmation'].includes(x.status)).length,
        availableVols: v.filter((x: any) => x.on_duty).length,
        avgResolution: Math.round(avgMin),
        severityPie: [
          { name: 'Critical', value: r.filter((x: any) => x.severity === 'critical').length },
          { name: 'Moderate', value: r.filter((x: any) => x.severity === 'moderate').length },
          { name: 'Low',      value: r.filter((x: any) => x.severity === 'low').length },
        ],
        trend,
      });
      setLoading(false);
    };
    load();
  }, []);

  if (loading || !data) return <div className="flex h-full items-center justify-center bg-[#0A0E17]"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>;

  const COLORS = ['#EF4444', '#F59E0B', '#3B82F6'];

  const statCards = [
    { label: 'Total Reports',     value: data.totalReports,  icon: Activity,       color: 'text-blue-400',    bg: 'bg-blue-500/10'    },
    { label: 'Active',            value: data.activeReports, icon: AlertTriangle,  color: 'text-amber-400',   bg: 'bg-amber-500/10'   },
    { label: 'Critical Open',     value: data.critical,      icon: AlertTriangle,  color: 'text-red-400',     bg: 'bg-red-500/10'     },
    { label: 'Resolved',          value: data.resolved,      icon: CheckCircle,    color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
    { label: 'Field Volunteers',  value: data.availableVols, icon: Users,          color: 'text-purple-400',  bg: 'bg-purple-500/10'  },
    { label: 'Avg Resolution',    value: `${data.avgResolution}m`, icon: Clock,    color: 'text-indigo-400',  bg: 'bg-indigo-500/10'  },
  ];

  const tooltipStyle = {
    contentStyle: { background: '#111827', border: '1px solid #1F2937', borderRadius: 6, color: '#F1F5F9', fontSize: 12 },
    labelStyle: { color: '#94A3B8' },
    cursor: { stroke: '#1F2937' },
  };

  return (
    <div className="p-6 md:p-8 min-h-screen bg-[#0A0E17] text-[#F1F5F9]">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-white">Analytics</h1>
        <p className="text-[13px] text-[#94A3B8] mt-0.5">System-wide overview and performance metrics</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        {statCards.map((s) => (
          <div key={s.label} className="bg-[#111827] border border-[#1F2937] rounded-lg p-4">
            <div className={`w-8 h-8 rounded-md ${s.bg} flex items-center justify-center mb-3`}>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-[11px] text-[#64748B] uppercase tracking-wider font-medium mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-[#111827] border border-[#1F2937] rounded-lg p-5">
          <h2 className="text-[14px] font-semibold text-white mb-5">Incident trend (24h)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <AreaChart data={data.trend}>
                <defs>
                  <linearGradient id="gNew" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="gResolved" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" vertical={false} />
                <XAxis dataKey="time" stroke="#4B5563" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#4B5563" fontSize={11} tickLine={false} axisLine={false} width={30} />
                <Tooltip {...tooltipStyle} />
                <Area type="monotone" dataKey="new"      stroke="#EF4444" strokeWidth={1.5} fill="url(#gNew)"      name="New" />
                <Area type="monotone" dataKey="resolved" stroke="#10B981" strokeWidth={1.5} fill="url(#gResolved)" name="Resolved" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="flex gap-5 mt-3 text-[12px] text-[#64748B]">
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-red-500 inline-block rounded" /> New reports</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 bg-emerald-500 inline-block rounded" /> Resolved</span>
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1F2937] rounded-lg p-5">
          <h2 className="text-[14px] font-semibold text-white mb-4">Severity breakdown</h2>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
              <PieChart>
                <Pie data={data.severityPie} cx="50%" cy="50%" innerRadius={50} outerRadius={70} paddingAngle={3} dataKey="value" stroke="none">
                  {data.severityPie.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#94A3B8' }} iconType="circle" iconSize={8} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
