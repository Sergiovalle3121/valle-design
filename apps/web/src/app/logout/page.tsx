"use client";
import { useEffect } from "react";
import { useDesignAuth } from "@/contexts/DesignAuthContext";
export default function LogoutPage(){const {logout}=useDesignAuth();useEffect(()=>{void logout().then(()=>window.location.assign("/login"));},[logout]);return <main className="p-8">Cerrando sesión…</main>;}
