'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, Box, Search, Plus, AlertTriangle, Truck, Anchor, Crosshair, Droplets } from 'lucide-react';

export default function ResourcesPage() {
  const [resources, setResources] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchResources = async () => {
      const { data, error } = await supabase
        .from('resources')
        .select('*')
        .order('category', { ascending: true });

      if (data) {
        setResources(data);
      }
      setLoading(false);
    };

    fetchResources();

    const subs = supabase
      .channel('resources_list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'resources' }, () => {
         fetchResources();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subs);
    };
  }, []);

  const updateQuantity = async (id: string, newAvailable: number) => {
    if (newAvailable < 0) return;
    await supabase.from('resources').update({ quantity_available: newAvailable }).eq('id', id);
  };

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-theme(spacing.16))] items-center justify-center bg-bg">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const filteredResources = resources.filter(r => 
      r.name.toLowerCase().includes(search.toLowerCase()) || 
      r.category.toLowerCase().includes(search.toLowerCase())
  );

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'medical_supply': return <Crosshair className="w-5 h-5 text-red-500" />;
      case 'vehicle': return <Truck className="w-5 h-5 text-amber-500" />;
      case 'equipment': return <Anchor className="w-5 h-5 text-blue-500" />;
      case 'food': return <Box className="w-5 h-5 text-emerald-500" />;
      case 'shelter': return <Droplets className="w-5 h-5 text-purple-500" />;
      default: return <Box className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="p-6 md:p-8 min-h-screen bg-bg text-text-primary">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Resource Management</h1>
          <p className="text-sm text-text-secondary mt-1">Track physical assets and supply lines</p>
        </div>
        
        <div className="flex gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input 
              type="text" 
              placeholder="Search assets..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-surface border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-text-muted focus:ring-2 focus:ring-blue-500/50 outline-none w-full md:w-64 transition-all"
            />
          </div>
          <button 
             className="bg-blue-600 hover:bg-blue-500 border border-blue-500/20 text-white font-medium py-2 px-4 rounded-xl flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add Asset</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredResources.map((resource) => {
          const ratio = resource.quantity_available / resource.quantity_total;
          const isLow = ratio < 0.2;
          
          return (
            <div key={resource.id} className="bg-surface border border-white/5 hover:bg-white/[0.02] transition-colors rounded-2xl p-5 shadow-md relative overflow-hidden group">
              <div className="flex items-start justify-between mb-4 relative z-10">
                <div className="w-10 h-10 rounded-xl bg-bg border border-white/5 flex items-center justify-center shrink-0">
                   {getCategoryIcon(resource.category)}
                </div>
                {isLow && (
                  <div className="bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Low Stock
                  </div>
                )}
              </div>
              
              <div className="relative z-10">
                 <h3 className="text-lg font-bold text-white leading-tight mb-1">{resource.name}</h3>
                 <p className="text-xs text-text-muted capitalize mb-4">{resource.category.replace('_', ' ')} • {resource.location_label}</p>
                 
                 <div className="bg-surface-raised/50 rounded-xl p-3 border border-white/5 mb-4">
                    <div className="flex justify-between items-end mb-2">
                       <span className="text-xs font-medium text-text-muted uppercase tracking-wider">Availability</span>
                       <span className="text-sm font-bold text-white">
                         {resource.quantity_available} / {resource.quantity_total}
                       </span>
                    </div>
                    
                    <div className="w-full bg-surface rounded-full h-2 overflow-hidden border border-white/5">
                      <div 
                        className={`h-2 rounded-full transition-all duration-500 ${isLow ? 'bg-red-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%` }}
                      ></div>
                    </div>
                 </div>

                 <div className="flex items-center justify-between border-t border-white/5 pt-4">
                    <div className="text-xs text-text-muted">Adjust Level</div>
                    <div className="flex items-center gap-2">
                       <button 
                         onClick={() => updateQuantity(resource.id, resource.quantity_available - 1)}
                         className="w-8 h-8 rounded-lg bg-surface border border-white/10 flex items-center justify-center text-text-secondary hover:text-white hover:border-white/20 transition-colors"
                         disabled={resource.quantity_available <= 0}
                       >
                         -
                       </button>
                       <button 
                         onClick={() => updateQuantity(resource.id, resource.quantity_available + 1)}
                         className="w-8 h-8 rounded-lg bg-surface border border-white/10 flex items-center justify-center text-text-secondary hover:text-white hover:border-white/20 transition-colors"
                         disabled={resource.quantity_available >= resource.quantity_total}
                       >
                         +
                       </button>
                    </div>
                 </div>
              </div>
            </div>
          );
        })}
        
        {filteredResources.length === 0 && (
          <div className="col-span-full py-12 text-center text-text-muted flex flex-col items-center justify-center border border-dashed border-white/10 rounded-2xl bg-surface/30">
            <Box className="w-12 h-12 text-white/5 mb-3" />
            No assets found matching your criteria.
          </div>
        )}
      </div>
    </div>
  );
}
