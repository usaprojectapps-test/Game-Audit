async function createUserSync(payload) {
  try {
    // 1. Create Auth user
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: payload.email,
      password: payload.password,
      email_confirm: true,
      user_metadata: {
        name: payload.name,
        role: payload.role,
        location_id: payload.location_id
      }
    });

    if (authError) {
      console.error("AUTH ERROR:", authError);
      return { error: authError };
    }

    // 2. Insert into public.users
    const { error: dbError } = await supabase.from("users").insert({
      id: authUser.user.id,          // same ID as auth.users
      name: payload.name,
      email: payload.email,
      role: payload.role,
      location_id: payload.location_id,
      status: payload.status,
      phone: payload.phone || null,
      department: payload.department || null
    });

    if (dbError) {
      console.error("DB ERROR:", dbError);
      return { error: dbError };
    }

    return { success: true };

  } catch (err) {
    console.error("UNEXPECTED ERROR:", err);
    return { error: err };
  }
}
