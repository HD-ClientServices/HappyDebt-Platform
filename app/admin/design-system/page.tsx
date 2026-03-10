import * as React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Code, LayoutTemplate, Type, Palette, Component, MousePointerClick } from "lucide-react"

export default function DesignSystemPage() {
    return (
        <div className="flex min-h-screen w-full bg-background text-foreground">
            {/* Sidebar: Claude Console Aesthetic */}
            <aside className="w-64 border-r border-border shrink-0 hidden md:flex flex-col bg-background">
                <div className="p-6">
                    <h1 className="text-lg font-heading font-bold text-foreground flex items-center gap-2">
                        <LayoutTemplate className="w-5 h-5 text-primary" />
                        Design System
                    </h1>
                    <p className="text-xs text-muted-foreground mt-1 font-sans">Atomic Framework Base</p>
                </div>

                <nav className="flex-1 px-4 space-y-1">
                    <div className="text-xs font-heading text-muted-foreground uppercase tracking-wider mb-2 mt-4 px-2">Atoms</div>
                    <a href="#colors" className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors text-foreground">
                        <Palette className="w-4 h-4" /> Colors
                    </a>
                    <a href="#typography" className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors text-foreground">
                        <Type className="w-4 h-4" /> Typography
                    </a>
                    <a href="#buttons" className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors text-foreground">
                        <MousePointerClick className="w-4 h-4" /> Buttons
                    </a>

                    <div className="text-xs font-heading text-muted-foreground uppercase tracking-wider mb-2 mt-8 px-2">Molecules</div>
                    <a href="#forms" className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors text-foreground">
                        <Code className="w-4 h-4" /> Forms & Inputs
                    </a>

                    <div className="text-xs font-heading text-muted-foreground uppercase tracking-wider mb-2 mt-8 px-2">Organisms</div>
                    <a href="#cards" className="flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors text-foreground">
                        <Component className="w-4 h-4" /> Cards & Data
                    </a>
                </nav>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto p-8 lg:p-12">
                <div className="max-w-5xl space-y-16">

                    {/* Header */}
                    <div>
                        <h2 className="text-3xl font-heading font-medium tracking-tight">HappyDebt UI</h2>
                        <p className="text-muted-foreground mt-2 max-w-2xl font-sans text-sm">
                            The living style guide. This system uses 1px strict borders, a `#0a0a0a` background base, and the HappyDebt brand Purple (`#7c3aed`) as the core accent.
                        </p>
                    </div>

                    <Separator className="bg-border" />

                    {/* ATOMS: Colors */}
                    <section id="colors" className="space-y-6 scroll-m-20">
                        <div className="space-y-1">
                            <h3 className="text-xl font-heading font-medium flex items-center gap-2">
                                <Palette className="w-5 h-5" /> Colors
                            </h3>
                            <p className="text-sm text-muted-foreground">The core variables powering the dark theme.</p>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="space-y-2">
                                <div className="h-24 rounded-lg border border-border bg-background flex items-end p-3">
                                    <span className="text-xs font-mono text-muted-foreground">bg-background</span>
                                </div>
                                <div className="text-sm font-medium">Background</div>
                            </div>

                            <div className="space-y-2">
                                <div className="h-24 rounded-lg border border-border bg-card flex items-end p-3">
                                    <span className="text-xs font-mono text-muted-foreground">bg-card</span>
                                </div>
                                <div className="text-sm font-medium">Card/Surface</div>
                            </div>

                            <div className="space-y-2">
                                <div className="h-24 rounded-lg border border-border bg-primary flex items-end p-3">
                                    <span className="text-xs font-mono text-primary-foreground">bg-primary</span>
                                </div>
                                <div className="text-sm font-medium flex items-center gap-2">
                                    Primary Brand <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30">#7c3aed</Badge>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <div className="h-24 rounded-lg border border-border bg-muted flex items-end p-3">
                                    <span className="text-xs font-mono text-muted-foreground">bg-muted</span>
                                </div>
                                <div className="text-sm font-medium">Muted / Border</div>
                            </div>
                        </div>
                    </section>

                    {/* ATOMS: Typography */}
                    <section id="typography" className="space-y-6 scroll-m-20">
                        <div className="space-y-1">
                            <h3 className="text-xl font-heading font-medium flex items-center gap-2">
                                <Type className="w-5 h-5" /> Typography
                            </h3>
                            <p className="text-sm text-muted-foreground">Space Grotesk for headings, Inter for UI and body text.</p>
                        </div>

                        <Card className="bg-transparent border-border rounded-xl">
                            <CardContent className="p-6 space-y-8">
                                <div className="space-y-2">
                                    <div className="text-xs font-mono text-muted-foreground tracking-wider uppercase">Heading 1 (Space Grotesk)</div>
                                    <h1 className="text-4xl font-heading font-bold tracking-tight text-foreground">Debt shouldn&apos;t define you.</h1>
                                </div>

                                <Separator className="bg-border" />

                                <div className="space-y-2">
                                    <div className="text-xs font-mono text-muted-foreground tracking-wider uppercase">Heading 2 (Space Grotesk)</div>
                                    <h2 className="text-2xl font-heading font-semibold tracking-tight text-foreground">It&apos;s time to take back control.</h2>
                                </div>

                                <Separator className="bg-border" />

                                <div className="space-y-2">
                                    <div className="text-xs font-mono text-muted-foreground tracking-wider uppercase">Body Large (Inter)</div>
                                    <p className="text-lg font-sans text-muted-foreground leading-relaxed">
                                        We help people overwhelmed by debt build a clear financial roadmap — combining the right mix of banking products and debt programs.
                                    </p>
                                </div>

                                <Separator className="bg-border" />

                                <div className="space-y-2">
                                    <div className="text-xs font-mono text-muted-foreground tracking-wider uppercase">UI Text (Inter)</div>
                                    <div className="flex gap-4">
                                        <Badge variant="outline" className="font-sans text-xs">Small UI Label</Badge>
                                        <span className="text-sm font-sans font-medium">Standard UI Weight</span>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </section>

                    {/* ATOMS: Buttons & Badges */}
                    <section id="buttons" className="space-y-6 scroll-m-20">
                        <div className="space-y-1">
                            <h3 className="text-xl font-heading font-medium flex items-center gap-2">
                                <MousePointerClick className="w-5 h-5" /> Buttons & Indicators
                            </h3>
                            <p className="text-sm text-muted-foreground">Interactive elements featuring the signature fully-rounded pill shape.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <Card className="bg-card border-border rounded-xl">
                                <CardHeader>
                                    <CardTitle className="text-sm font-heading font-medium">Buttons</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <div className="flex flex-wrap gap-4 items-center">
                                        <Button className="rounded-full bg-primary text-primary-foreground hover:bg-primary/90">
                                            Primary Action
                                        </Button>
                                        <Button variant="outline" className="rounded-full border-border bg-transparent hover:bg-muted text-foreground">
                                            Secondary Outline
                                        </Button>
                                        <Button variant="ghost" className="rounded-full hover:bg-muted">
                                            Ghost Link
                                        </Button>
                                    </div>
                                    <div className="p-4 bg-background border border-border rounded-xl flex items-center justify-between">
                                        <span className="text-sm">Cost Limit</span>
                                        <Button size="sm" variant="outline" className="rounded-full h-8 px-3 text-xs border-border">
                                            Edit limit
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card className="bg-card border-border rounded-xl">
                                <CardHeader>
                                    <CardTitle className="text-sm font-heading font-medium">Badges</CardTitle>
                                </CardHeader>
                                <CardContent className="flex flex-wrap gap-4 items-center">
                                    <Badge className="bg-primary hover:bg-primary rounded-full px-2.5 py-0.5 font-medium text-xs">
                                        Brand Priority
                                    </Badge>
                                    <Badge variant="secondary" className="bg-muted text-foreground hover:bg-muted rounded-full px-2.5 py-0.5 font-medium text-xs border border-border">
                                        Neutral Info
                                    </Badge>
                                    <Badge variant="outline" className="text-muted-foreground border-border rounded-full px-2.5 py-0.5 font-medium text-xs">
                                        Status Outline
                                    </Badge>
                                </CardContent>
                            </Card>
                        </div>
                    </section>

                    {/* MOLECULES: Forms */}
                    <section id="forms" className="space-y-6 scroll-m-20">
                        <div className="space-y-1">
                            <h3 className="text-xl font-heading font-medium flex items-center gap-2">
                                <Code className="w-5 h-5" /> Forms & Inputs
                            </h3>
                            <p className="text-sm text-muted-foreground">Claude Console-style tight forms with 1px borders and slight 6px radii.</p>
                        </div>

                        <Card className="bg-transparent border-border rounded-xl max-w-lg">
                            <CardHeader>
                                <CardTitle className="text-lg font-heading">Settings</CardTitle>
                                <CardDescription className="text-sm font-sans">Manage your workspace preferences.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="workspace-name" className="text-xs text-muted-foreground uppercase tracking-wider">Workspace Name</Label>
                                    <Input id="workspace-name" defaultValue="Vicente's Individual Plan" className="bg-card border-border rounded-md shadow-sm h-9 focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0" />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="role" className="text-xs text-muted-foreground uppercase tracking-wider">Default Role</Label>
                                    <Select defaultValue="admin">
                                        <SelectTrigger id="role" className="bg-card border-border rounded-md shadow-sm h-9 focus:ring-1 focus:ring-primary focus:ring-offset-0">
                                            <SelectValue placeholder="Select role" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-card border-border">
                                            <SelectItem value="admin">Administrator</SelectItem>
                                            <SelectItem value="member">Member</SelectItem>
                                            <SelectItem value="viewer">Viewer</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardContent>
                            <CardFooter className="bg-card/50 border-t border-border p-4 flex justify-end rounded-b-xl">
                                <Button className="rounded-full bg-primary hover:bg-primary/90 text-primary-foreground h-8 px-4 text-xs font-medium">
                                    Save Changes
                                </Button>
                            </CardFooter>
                        </Card>
                    </section>

                    {/* ORGANISMS: Layouts & Cards */}
                    <section id="cards" className="space-y-6 scroll-m-20 pb-24">
                        <div className="space-y-1">
                            <h3 className="text-xl font-heading font-medium flex items-center gap-2">
                                <Component className="w-5 h-5" /> Cards & Data Displays
                            </h3>
                            <p className="text-sm text-muted-foreground">High contrast, thin bordered structural components used to group information.</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Cost Card Replica */}
                            <Card className="bg-card border-border rounded-xl col-span-1 md:col-span-1 flex flex-col justify-between overflow-hidden">
                                <CardHeader className="pb-2">
                                    <CardTitle className="text-sm font-sans font-medium text-foreground">Total code execution cost</CardTitle>
                                    <CardDescription className="text-xs text-muted-foreground mt-1">
                                        Code execution costs can only be broken down by workspace.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="pt-4 pb-6 border-t border-border bg-background/50 mt-auto">
                                    <div className="text-3xl font-heading font-medium tracking-tight">USD 0.00</div>
                                </CardContent>
                            </Card>

                            {/* Data Table Replica */}
                            <Card className="bg-transparent border-border rounded-xl col-span-1 md:col-span-2 overflow-hidden">
                                <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-card">
                                    <h4 className="text-sm font-heading font-medium">Recent Debt Audits</h4>
                                    <Button variant="outline" size="sm" className="h-7 text-xs rounded-full border-border">Export</Button>
                                </div>
                                <div className="w-full">
                                    <table className="w-full text-sm font-sans text-left">
                                        <thead className="bg-background text-muted-foreground text-xs uppercase tracking-wider">
                                            <tr>
                                                <th className="px-5 py-3 font-medium border-b border-border">Auditor</th>
                                                <th className="px-5 py-3 font-medium border-b border-border">Status</th>
                                                <th className="px-5 py-3 font-medium border-b border-border text-right">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border bg-card">
                                            <tr className="hover:bg-muted/50 transition-colors">
                                                <td className="px-5 py-3 text-foreground font-medium">Sarah Jenkins</td>
                                                <td className="px-5 py-3"><Badge variant="outline" className="border-primary/30 text-primary bg-primary/10 rounded-full font-normal">Active</Badge></td>
                                                <td className="px-5 py-3 text-right font-mono">$12,450.00</td>
                                            </tr>
                                            <tr className="hover:bg-muted/50 transition-colors">
                                                <td className="px-5 py-3 text-foreground font-medium">Michael Chang</td>
                                                <td className="px-5 py-3"><Badge variant="outline" className="border-border text-muted-foreground rounded-full font-normal">Pending</Badge></td>
                                                <td className="px-5 py-3 text-right font-mono">$8,120.50</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        </div>
                    </section>

                </div>
            </main>
        </div>
    )
}
