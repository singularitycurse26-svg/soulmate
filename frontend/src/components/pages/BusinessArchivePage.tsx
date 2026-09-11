import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import {
  FaxMachineDept,
  ContactsDept,
  ProjectAnalyzerDept,
  CustomDept,
} from "@/components/trading/business-archive";
import {
  getDepartments, type Department,
} from "@/lib/businessArchive";
import {
  Folder, Briefcase, Printer, BookUser, ScanSearch,
  FileText, Archive, Settings,
} from "lucide-react";

const ICON_MAP: Record<string, any> = {
  Fax: Printer, Folder, Briefcase, AddressBook: BookUser, ScanSearch, FileText, Archive, Settings,
};

export function BusinessArchivePage() {
  const [departments, setDepartments] = useState<Department[]>(getDepartments());
  const [activeDept, setActiveDept] = useState(1);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-accent/10 border border-accent/20">
          <Briefcase className="w-6 h-6 text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Business Archive</h1>
          <p className="text-sm text-muted mt-0.5">
            8 departments · Universal memory & journal integrated across all projects
          </p>
        </div>
      </div>

      {/* Department grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {departments.map((dept) => {
          const Icon = ICON_MAP[dept.icon] || Folder;
          const active = activeDept === dept.id;
          return (
            <button
              key={dept.id}
              onClick={() => setActiveDept(dept.id)}
              className={cn(
                "relative flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all",
                active
                  ? "bg-accent/10 border-accent/30 text-accent"
                  : "bg-bg-card border-white/5 text-muted hover:text-white hover:border-white/10"
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn(
                  "text-[10px] font-mono px-1.5 py-0.5 rounded",
                  active ? "bg-accent/20" : "bg-white/5"
                )}>
                  {dept.id}
                </span>
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[11px] font-medium text-center leading-tight">{dept.name}</span>
              {dept.customizable && (
                <span className="text-[8px] text-muted/60">custom</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Active department content */}
      <div className="card p-4 min-h-[400px]">
        {activeDept === 1 && <FaxMachineDept />}
        {activeDept === 4 && <ContactsDept />}
        {activeDept === 5 && <ProjectAnalyzerDept />}
        {[2, 3, 6, 7, 8].includes(activeDept) && (
          <CustomDept dept={departments.find(d => d.id === activeDept)!}
            onUpdate={(updates) => {
              const depts = departments.map(d => d.id === activeDept ? { ...d, ...updates } : d);
              setDepartments(depts);
            }}
          />
        )}
      </div>
    </div>
  );
}
