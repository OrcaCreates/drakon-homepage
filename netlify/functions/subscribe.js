exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const { email, name } = JSON.parse(event.body);

    const response = await fetch(
      "https://emailoctopus.com/api/1.6/lists/c7d13ede-4d81-11f1-b5bd-03a9b8e421f4/contacts",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: process.env.EMAILOCTOPUS_API_KEY,
          email_address: email,
          fields: { FirstName: name },
          status: "SUBSCRIBED",
        }),
      }
    );

    const data = await response.json();

    if (!response.ok && data.error?.code !== "MEMBER_EXISTS_WITH_EMAIL_ADDRESS") {
      return { statusCode: 500, body: JSON.stringify({ error: data.error }) };
    }

    return { statusCode: 200, body: JSON.stringify({ success: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
