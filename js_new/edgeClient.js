export async function callEdgeFunction(name, payload) {
  const res = await fetch(
    `https://kjfzdmmloryzbuiixceh.supabase.co/functions/v1/${name}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

  const data = await res.json();
  return { data, error: !res.ok ? data : null };
}
