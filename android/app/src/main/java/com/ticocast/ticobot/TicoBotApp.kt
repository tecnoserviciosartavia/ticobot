package com.ticocast.ticobot

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.BitmapFactory
import android.os.Build
import android.provider.OpenableColumns
import android.util.Base64
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.fragment.app.FragmentActivity
import androidx.core.content.ContextCompat
import kotlinx.coroutines.delay

private val Emerald = Color(0xFF087F5B)
private val AppColors = lightColorScheme(primary = Emerald, secondary = Color(0xFF0F766E), surface = Color(0xFFF8FAF9), background = Color(0xFFF2F5F3))
private val DarkAppColors = darkColorScheme(
    primary = Color(0xFF38BDF8),
    onPrimary = Color(0xFF00131F),
    primaryContainer = Color(0xFF082F49),
    onPrimaryContainer = Color(0xFFBAE6FD),
    secondary = Color(0xFF22D3EE),
    onSecondary = Color(0xFF001417),
    secondaryContainer = Color(0xFF164E63),
    onSecondaryContainer = Color(0xFFCFFAFE),
    tertiary = Color(0xFF7DD3FC),
    onTertiary = Color(0xFF00131F),
    tertiaryContainer = Color(0xFF0C4A6E),
    onTertiaryContainer = Color(0xFFE0F2FE),
    background = Color(0xFF030609),
    onBackground = Color(0xFFE6F4FA),
    surface = Color(0xFF080D12),
    onSurface = Color(0xFFE6F4FA),
    surfaceContainer = Color(0xFF101820),
    surfaceVariant = Color(0xFF18232D),
    onSurfaceVariant = Color(0xFFB8CAD5),
    outline = Color(0xFF536975),
)
private val ChatEmojis = listOf("😀", "😂", "😊", "😍", "🥳", "😢", "🙏", "👍", "❤️", "✅", "🎉", "📌", "💳", "📄")

enum class AppSection(val label: String) { Home("Inicio"), Clients("Clientes"), Contracts("Contratos"), Chats("Chats"), More("Más") }

@Composable
fun TicoBotApp(viewModel: AppViewModel = viewModel()) {
    val state by viewModel.state
    val context = LocalContext.current
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        viewModel.setNotificationsEnabled(it)
    }
    var biometricUnlocked by remember(state.token, state.biometricEnabled) { mutableStateOf(!state.biometricEnabled) }
    LaunchedEffect(state.user?.email, state.notificationsEnabled) {
        if (state.user != null && state.notificationsEnabled) {
            if (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) {
                viewModel.syncPushToken()
            } else {
                notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }
    MaterialTheme(colorScheme = if (state.darkMode) DarkAppColors else AppColors) {
        Surface(Modifier.fillMaxSize()) {
            if (state.token == null || state.user == null) LoginScreen(state, viewModel)
            else if (!biometricUnlocked) BiometricLockScreen(
                onUnlocked = { biometricUnlocked = true },
                onLogout = viewModel::logout,
            )
            else MainShell(state, viewModel)
        }
    }
}

@Composable
private fun BiometricLockScreen(onUnlocked: () -> Unit, onLogout: () -> Unit) {
    val activity = LocalContext.current as FragmentActivity
    var error by remember { mutableStateOf<String?>(null) }
    fun unlock() = BiometricAuthenticator.authenticate(activity, onUnlocked) { error = it }
    LaunchedEffect(Unit) { unlock() }
    Column(Modifier.fillMaxSize().statusBarsPadding().padding(28.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
        Box(Modifier.size(84.dp).background(MaterialTheme.colorScheme.primaryContainer, CircleShape), contentAlignment = Alignment.Center) { Icon(Icons.Default.Lock, null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(42.dp)) }
        Text("TicoBot está protegido", fontSize = 26.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 24.dp))
        Text("Usá tu huella o el bloqueo del teléfono para continuar.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp, bottom = 22.dp))
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(bottom = 12.dp)) }
        Button(::unlock, Modifier.fillMaxWidth().height(54.dp)) { Icon(Icons.Default.Lock, null); Spacer(Modifier.width(8.dp)); Text("Desbloquear") }
        TextButton(onLogout) { Text("Cerrar sesión") }
    }
}

@Composable
private fun LoginScreen(state: AppState, vm: AppViewModel) {
    var email by remember { mutableStateOf("") }; var password by remember { mutableStateOf("") }
    Column(Modifier.fillMaxSize().statusBarsPadding().padding(24.dp), verticalArrangement = Arrangement.Center) {
        Box(Modifier.size(68.dp).background(MaterialTheme.colorScheme.primary, RoundedCornerShape(20.dp)), contentAlignment = Alignment.Center) { Icon(Icons.Default.Email, null, tint = Color.White, modifier = Modifier.size(34.dp)) }
        Spacer(Modifier.height(24.dp)); Text("Bienvenido a TicoBot", fontSize = 30.sp, fontWeight = FontWeight.Bold)
        Text("Gestioná tu negocio desde el celular.", color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 8.dp, bottom = 28.dp))
        OutlinedTextField(email, { email = it; vm.clearError() }, Modifier.fillMaxWidth(), label = { Text("Correo electrónico") }, leadingIcon = { Icon(Icons.Default.Email, null) }, singleLine = true, shape = RoundedCornerShape(16.dp))
        Spacer(Modifier.height(14.dp)); OutlinedTextField(password, { password = it; vm.clearError() }, Modifier.fillMaxWidth(), label = { Text("Contraseña") }, leadingIcon = { Icon(Icons.Default.Lock, null) }, visualTransformation = PasswordVisualTransformation(), singleLine = true, shape = RoundedCornerShape(16.dp))
        state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 12.dp)) }
        Button({ vm.login(email, password) }, enabled = !state.loading && email.isNotBlank() && password.isNotBlank(), modifier = Modifier.fillMaxWidth().padding(top = 18.dp).height(56.dp), shape = RoundedCornerShape(16.dp)) { if (state.loading) CircularProgressIndicator(Modifier.size(22.dp), color = Color.White) else Text("Ingresar", fontWeight = FontWeight.Bold) }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainShell(state: AppState, vm: AppViewModel) {
    var section by rememberSaveable { mutableStateOf(AppSection.Home) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(3_000)
            vm.refreshChats()
        }
    }
    if (state.activeChat != null) { ConversationScreen(state, vm); return }
    Scaffold(
        topBar = { TopAppBar(title = { Text("TicoBot", fontWeight = FontWeight.Bold) }, actions = { IconButton(vm::refresh) { Icon(Icons.Default.Refresh, "Actualizar") } }) },
        bottomBar = { NavigationBar { AppSection.entries.forEach { item -> NavigationBarItem(section == item, { section = item }, { Icon(sectionIcon(item), item.label) }, label = { Text(item.label, maxLines = 1) }) } } }
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            AnimatedContent(section, label = "Navegación principal") { currentSection ->
                when (currentSection) {
                    AppSection.Home -> HomeScreen(state) { section = it }
                    AppSection.Clients -> ClientsScreen(state.clients, vm::saveClient, vm::resendClientAccess)
                    AppSection.Contracts -> ContractsScreen(state.contracts, state.clients, state.services, vm::saveContract)
                    AppSection.Chats -> ChatsScreen(state.chats, vm::openChat, vm::createConversation)
                    AppSection.More -> MoreScreen(state, vm)
                }
            }
            if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth().align(Alignment.TopCenter))
            state.error?.let { ErrorBanner(it, vm::clearError, Modifier.align(Alignment.BottomCenter)) }
            state.notice?.let { NoticeBanner(it, vm::clearNotice, Modifier.align(Alignment.BottomCenter)) }
        }
    }
}

private fun sectionIcon(section: AppSection) = when (section) { AppSection.Home -> Icons.Default.Home; AppSection.Clients -> Icons.Default.Person; AppSection.Contracts -> Icons.Default.List; AppSection.Chats -> Icons.Default.Email; AppSection.More -> Icons.Default.MoreVert }

@Composable
private fun HomeScreen(state: AppState, navigate: (AppSection) -> Unit) = LazyColumn(contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
    item { Text("Resumen del negocio", fontSize = 24.sp, fontWeight = FontWeight.Bold) }
    item { Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) { MetricCard("Clientes", state.clients.size, Icons.Default.Person, Modifier.weight(1f)) { navigate(AppSection.Clients) }; MetricCard("Contratos", state.contracts.size, Icons.Default.List, Modifier.weight(1f)) { navigate(AppSection.Contracts) } } }
    item { Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) { MetricCard("Chats", state.chats.size, Icons.Default.Email, Modifier.weight(1f)) { navigate(AppSection.Chats) }; MetricCard("Sin leer", state.chats.sumOf { it.unread }, Icons.Default.Info, Modifier.weight(1f)) { navigate(AppSection.Chats) } } }
    item { Text("Tocá cualquier tarjeta para abrir el módulo", color = MaterialTheme.colorScheme.onSurfaceVariant) }
}

@Composable
private fun MetricCard(label: String, value: Int, icon: androidx.compose.ui.graphics.vector.ImageVector, modifier: Modifier, onClick: () -> Unit) = Card(onClick, modifier, shape = RoundedCornerShape(20.dp)) { Column(Modifier.padding(18.dp)) { Icon(icon, null, tint = MaterialTheme.colorScheme.primary); Text(value.toString(), fontSize = 28.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 14.dp)); Text(label, color = MaterialTheme.colorScheme.onSurfaceVariant) } }

@Composable
private fun ClientsScreen(
    clients: List<ClientItem>,
    save: (ClientItem, () -> Unit) -> Unit,
    resendAccess: (ClientItem) -> Unit,
) {
    var selected by remember { mutableStateOf<ClientItem?>(null) }
    var editing by remember { mutableStateOf<ClientItem?>(null) }
    var creating by remember { mutableStateOf(false) }
    if (editing != null || creating) {
        BackHandler { editing = null; creating = false }
        ClientEditor(editing, { editing = null; creating = false }) { client -> save(client) { editing = null; creating = false; selected = null } }
        return
    }
    if (selected != null) {
        BackHandler { selected = null }
        ClientDetail(selected!!, { selected = null }, { editing = selected }, resendAccess)
        return
    }
    Box(Modifier.fillMaxSize()) {
        SearchList("Buscar clientes", clients, { it.name + it.phone + it.email }) { client -> EntityCard(client.name, client.phone.ifBlank { "Sin teléfono" }, client.status, Icons.Default.Person) { selected = client } }
        FloatingActionButton({ creating = true }, Modifier.align(Alignment.BottomEnd).padding(18.dp)) { Icon(Icons.Default.Add, "Crear cliente") }
    }
}

@Composable
private fun ContractsScreen(contracts: List<ContractItem>, clients: List<ClientItem>, services: List<ServiceItem>, save: (ContractItem, () -> Unit) -> Unit) {
    var selected by remember { mutableStateOf<ContractItem?>(null) }
    var editing by remember { mutableStateOf<ContractItem?>(null) }
    var creating by remember { mutableStateOf(false) }
    if (editing != null || creating) {
        BackHandler { editing = null; creating = false }
        ContractEditor(editing, clients, services, { editing = null; creating = false }) { contract -> save(contract) { editing = null; creating = false; selected = null } }
        return
    }
    if (selected != null) {
        BackHandler { selected = null }
        ContractDetail(selected!!, { selected = null }) { editing = selected }
        return
    }
    Box(Modifier.fillMaxSize()) {
        SearchList("Buscar contratos", contracts, { it.client + it.status + it.billingCycle }) { contract -> EntityCard(contract.client, "${contract.currency} ${contract.amount}", contract.status, Icons.Default.List) { selected = contract } }
        if (clients.isNotEmpty()) FloatingActionButton({ creating = true }, Modifier.align(Alignment.BottomEnd).padding(18.dp)) { Icon(Icons.Default.Add, "Crear contrato") }
    }
}

@Composable
private fun ClientEditor(existing: ClientItem?, back: () -> Unit, save: (ClientItem) -> Unit) {
    var name by remember(existing) { mutableStateOf(existing?.name.orEmpty()) }
    var phone by remember(existing) { mutableStateOf(existing?.phone.orEmpty()) }
    var email by remember(existing) { mutableStateOf(existing?.email.orEmpty()) }
    var status by remember(existing) { mutableStateOf(existing?.status ?: "active") }
    var notes by remember(existing) { mutableStateOf(existing?.notes.orEmpty()) }
    ModulePage(if (existing == null || existing.id == 0L) "Nuevo cliente" else "Editar cliente", back) {
        item {
            OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("Nombre *") }, singleLine = true)
            Spacer(Modifier.height(12.dp)); OutlinedTextField(phone, { phone = it }, Modifier.fillMaxWidth(), label = { Text("Teléfono") }, singleLine = true)
            Spacer(Modifier.height(12.dp)); OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("Correo") }, singleLine = true)
            Spacer(Modifier.height(12.dp)); OutlinedTextField(status, { status = it }, Modifier.fillMaxWidth(), label = { Text("Estado") }, supportingText = { Text("Ejemplo: active") }, singleLine = true)
            Spacer(Modifier.height(12.dp)); OutlinedTextField(notes, { notes = it }, Modifier.fillMaxWidth(), label = { Text("Notas") }, minLines = 4, maxLines = 8)
            Spacer(Modifier.height(20.dp))
            Button({ save(ClientItem(existing?.id ?: 0, name.trim(), phone.trim(), email.trim(), status.trim(), notes.trim(), existing?.contracts ?: 0, existing?.reminders ?: 0, existing?.payments ?: 0)) }, Modifier.fillMaxWidth().height(54.dp), enabled = name.isNotBlank() && status.isNotBlank()) { Icon(Icons.Default.Check, null); Spacer(Modifier.width(8.dp)); Text("Guardar cliente") }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ContractEditor(existing: ContractItem?, clients: List<ClientItem>, services: List<ServiceItem>, back: () -> Unit, save: (ContractItem) -> Unit) {
    var selectedClientId by remember(existing) { mutableStateOf(existing?.clientId ?: clients.firstOrNull()?.id ?: 0) }
    var clientMenuOpen by remember { mutableStateOf(false) }
    var platformMenuOpen by remember { mutableStateOf(false) }
    var selectedServiceIds by remember(existing, services) { mutableStateOf(existing?.serviceIds?.toSet().orEmpty()) }
    var currency by remember(existing) { mutableStateOf(existing?.currency ?: "CRC") }
    var billingCycle by remember(existing) { mutableStateOf(existing?.billingCycle ?: "monthly") }
    var status by remember(existing) { mutableStateOf(existing?.status ?: "active") }
    var nextDueDate by remember(existing) { mutableStateOf(existing?.nextDueDate.orEmpty().take(10)) }
    var graceDays by remember(existing) { mutableStateOf((existing?.graceDays ?: 0).toString()) }
    var notes by remember(existing) { mutableStateOf(existing?.notes.orEmpty()) }
    val selectedClient = clients.firstOrNull { it.id == selectedClientId }
    val selectedServices = services.filter { it.id in selectedServiceIds }
    val calculatedAmount = selectedServices.sumOf { it.price.toDoubleOrNull() ?: 0.0 }
    ModulePage(if (existing == null) "Nuevo contrato" else "Editar contrato", back) {
        item {
            Text("Cliente *", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Box {
                OutlinedButton({ clientMenuOpen = true }, Modifier.fillMaxWidth().height(54.dp)) { Text(selectedClient?.name ?: "Seleccionar cliente", Modifier.weight(1f)); Icon(Icons.Default.ArrowDropDown, null) }
                DropdownMenu(clientMenuOpen, { clientMenuOpen = false }) { clients.forEach { client -> DropdownMenuItem({ Text(client.name) }, { selectedClientId = client.id; clientMenuOpen = false }) } }
            }
            Spacer(Modifier.height(16.dp)); Text("Plataformas asignadas *", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Box {
                OutlinedButton({ platformMenuOpen = true }, Modifier.fillMaxWidth().height(54.dp)) {
                    Text(if (selectedServices.isEmpty()) "Seleccionar plataformas" else "${selectedServices.size} plataforma${if (selectedServices.size == 1) "" else "s"}", Modifier.weight(1f))
                    Icon(Icons.Default.ArrowDropDown, null)
                }
                DropdownMenu(platformMenuOpen, { platformMenuOpen = false }) {
                    services.filter { it.active || it.id in selectedServiceIds }.forEach { service ->
                        val selected = service.id in selectedServiceIds
                        DropdownMenuItem(
                            text = { Column { Text(service.name, fontWeight = FontWeight.SemiBold); Text("${service.currency} ${service.price}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) } },
                            onClick = { selectedServiceIds = if (selected) selectedServiceIds - service.id else selectedServiceIds + service.id },
                            leadingIcon = { if (selected) Icon(Icons.Default.Check, "Seleccionada", tint = MaterialTheme.colorScheme.primary) else Spacer(Modifier.size(24.dp)) },
                        )
                    }
                }
            }
            if (selectedServices.isNotEmpty()) FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                selectedServices.forEach { service -> InputChip(selected = true, onClick = { selectedServiceIds = selectedServiceIds - service.id }, label = { Text(service.name) }, trailingIcon = { Icon(Icons.Default.Close, "Quitar", Modifier.size(16.dp)) }) }
            }
            Text("Monto calculado: ${currency} ${"%.2f".format(calculatedAmount)}", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(12.dp)); OutlinedTextField(currency, { currency = it.take(3).uppercase() }, Modifier.fillMaxWidth(), label = { Text("Moneda *") }, supportingText = { Text("CRC o USD") }, singleLine = true)
            Spacer(Modifier.height(12.dp)); OutlinedTextField(billingCycle, { billingCycle = it }, Modifier.fillMaxWidth(), label = { Text("Ciclo de cobro *") }, supportingText = { Text("Ejemplo: monthly") }, singleLine = true)
            Spacer(Modifier.height(12.dp)); OutlinedTextField(status, { status = it }, Modifier.fillMaxWidth(), label = { Text("Estado") }, supportingText = { Text("active, paused o cancelled") }, singleLine = true)
            Spacer(Modifier.height(12.dp)); OutlinedTextField(nextDueDate, { nextDueDate = it }, Modifier.fillMaxWidth(), label = { Text("Próximo vencimiento") }, supportingText = { Text("Formato: AAAA-MM-DD") }, singleLine = true)
            Spacer(Modifier.height(12.dp)); OutlinedTextField(graceDays, { graceDays = it.filter(Char::isDigit).take(2) }, Modifier.fillMaxWidth(), label = { Text("Días de gracia") }, singleLine = true)
            Spacer(Modifier.height(12.dp)); OutlinedTextField(notes, { notes = it }, Modifier.fillMaxWidth(), label = { Text("Notas") }, minLines = 4, maxLines = 8)
            Spacer(Modifier.height(20.dp))
            val valid = selectedClientId > 0 && selectedServiceIds.isNotEmpty() && currency.length == 3 && billingCycle.isNotBlank() && status in listOf("active", "paused", "cancelled")
            Button({ save(ContractItem(existing?.id ?: 0, selectedClientId, selectedClient?.name.orEmpty(), calculatedAmount.toString(), currency, status, billingCycle.trim(), nextDueDate.trim(), graceDays.toIntOrNull() ?: 0, notes.trim(), existing?.reminders ?: 0, existing?.payments ?: 0, selectedServiceIds.toList(), selectedServices.map { it.name })) }, Modifier.fillMaxWidth().height(54.dp), enabled = valid) { Icon(Icons.Default.Check, null); Spacer(Modifier.width(8.dp)); Text("Guardar contrato") }
        }
    }
}

@Composable
private fun ChatsScreen(chats: List<ChatItem>, open: (ChatItem) -> Unit, create: (String, String, () -> Unit) -> Unit) {
    var creating by rememberSaveable { mutableStateOf(false) }
    var showNewMessageLabel by rememberSaveable { mutableStateOf(true) }
    var phone by rememberSaveable { mutableStateOf("") }
    var body by rememberSaveable { mutableStateOf("") }
    LaunchedEffect(Unit) { delay(4_000); showNewMessageLabel = false }
    Box(Modifier.fillMaxSize()) {
        SearchList("Buscar chats transferidos", chats, { it.name + it.phone }) { ChatRow(it) { open(it) } }
        Box(Modifier.align(Alignment.BottomEnd).padding(18.dp)) {
            AnimatedContent(showNewMessageLabel, label = "Botón nuevo mensaje") { expanded ->
                if (expanded) ExtendedFloatingActionButton(onClick = { creating = true }, icon = { Icon(Icons.Default.Add, null) }, text = { Text("Nuevo mensaje") })
                else FloatingActionButton(onClick = { creating = true }) { Icon(Icons.Default.Add, "Nuevo mensaje") }
            }
        }
    }
    if (creating) AlertDialog(
        onDismissRequest = { creating = false },
        title = { Text("Iniciar conversación") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Escribí el número con código de país y el primer mensaje.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                OutlinedTextField(phone, { phone = it.filter(Char::isDigit) }, Modifier.fillMaxWidth(), label = { Text("Teléfono") }, singleLine = true)
                OutlinedTextField(body, { body = it }, Modifier.fillMaxWidth(), label = { Text("Mensaje") }, minLines = 3, maxLines = 6)
            }
        },
        confirmButton = { TextButton({ create(phone, body) { creating = false; phone = ""; body = "" } }, enabled = phone.length >= 8 && body.isNotBlank()) { Text("Enviar") } },
        dismissButton = { TextButton({ creating = false }) { Text("Cancelar") } },
    )
}

@Composable
private fun <T> SearchList(placeholder: String, entries: List<T>, searchable: (T) -> String, row: @Composable (T) -> Unit) { var query by remember { mutableStateOf("") }; val visible = remember(entries, query) { entries.filter { searchable(it).contains(query, true) } }; Column(Modifier.fillMaxSize()) { OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 16.dp), placeholder = { Text(placeholder) }, leadingIcon = { Icon(Icons.Default.Search, null) }, shape = RoundedCornerShape(18.dp), singleLine = true); if (visible.isEmpty()) EmptyState("No encontramos resultados") else LazyColumn(Modifier.fillMaxWidth(), contentPadding = PaddingValues(horizontal = 6.dp, vertical = 4.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { itemsIndexed(visible) { index, entry -> AnimatedListEntry(index) { row(entry) } } } } }

@Composable
private fun AnimatedListEntry(index: Int, content: @Composable () -> Unit) {
    var visible by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) { delay((index.coerceAtMost(8) * 35).toLong()); visible = true }
    AnimatedVisibility(visible, enter = fadeIn() + slideInVertically { it / 3 }) { content() }
}

@Composable
private fun EntityCard(title: String, subtitle: String, status: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) = Card(onClick, Modifier.fillMaxWidth().animateContentSize(), shape = RoundedCornerShape(18.dp)) { Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) { Avatar(title, icon); Column(Modifier.weight(1f).padding(horizontal = 14.dp)) { Text(title, fontWeight = FontWeight.SemiBold, maxLines = 1); Text(subtitle, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1) }; Text(status, fontSize = 12.sp, color = MaterialTheme.colorScheme.primary); Icon(Icons.Default.ArrowForward, null, tint = MaterialTheme.colorScheme.onSurfaceVariant) } }

@Composable
private fun ClientDetail(
    client: ClientItem,
    back: () -> Unit,
    edit: () -> Unit,
    resendAccess: (ClientItem) -> Unit,
) {
    var confirmResend by remember(client.id) { mutableStateOf(false) }

    DetailPage("Cliente", client.name, back) {
        Button(edit, Modifier.fillMaxWidth()) { Icon(Icons.Default.Edit, null); Spacer(Modifier.width(8.dp)); Text("Editar cliente") }
        OutlinedButton(
            onClick = { confirmResend = true },
            modifier = Modifier.fillMaxWidth(),
            enabled = client.phone.isNotBlank() && client.contracts > 0,
        ) {
            Icon(Icons.Default.Send, null)
            Spacer(Modifier.width(8.dp))
            Text("Reenviar accesos")
        }
        if (client.phone.isBlank()) Text("Agregá un teléfono al cliente para poder enviarle sus accesos.", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
        DetailLine(Icons.Default.Info, "Teléfono", client.phone.ifBlank { "Sin teléfono" })
        DetailLine(Icons.Default.Email, "Correo", client.email.ifBlank { "Sin correo" })
        DetailLine(Icons.Default.Info, "Estado", client.status)
        DetailLine(Icons.Default.List, "Contratos", client.contracts.toString())
        DetailLine(Icons.Default.Info, "Pagos", client.payments.toString())
        DetailLine(Icons.Default.Info, "Recordatorios", client.reminders.toString())
        if (client.notes.isNotBlank()) DetailLine(Icons.Default.Info, "Notas", client.notes)
    }

    if (confirmResend) AlertDialog(
        onDismissRequest = { confirmResend = false },
        title = { Text("Reenviar accesos") },
        text = { Text("Se enviarán por WhatsApp los accesos de todos los contratos al día de ${client.name}.") },
        confirmButton = {
            Button({
                confirmResend = false
                resendAccess(client)
            }) { Text("Reenviar") }
        },
        dismissButton = { TextButton({ confirmResend = false }) { Text("Cancelar") } },
    )
}

@Composable
private fun ContractDetail(contract: ContractItem, back: () -> Unit, edit: () -> Unit) = DetailPage("Contrato", contract.client, back) { Button(edit, Modifier.fillMaxWidth()) { Icon(Icons.Default.Edit, null); Spacer(Modifier.width(8.dp)); Text("Editar plataformas") }; DetailLine(Icons.Default.List, "Plataformas", contract.serviceNames.joinToString().ifBlank { "Sin plataformas" }); DetailLine(Icons.Default.Info, "Monto calculado", "${contract.currency} ${contract.amount}"); DetailLine(Icons.Default.Info, "Estado", contract.status); DetailLine(Icons.Default.Info, "Ciclo de cobro", contract.billingCycle.ifBlank { "No definido" }); DetailLine(Icons.Default.Info, "Próximo vencimiento", contract.nextDueDate.ifBlank { "No definido" }); DetailLine(Icons.Default.Info, "Días de gracia", contract.graceDays.toString()); DetailLine(Icons.Default.Info, "Pagos", contract.payments.toString()); DetailLine(Icons.Default.Info, "Recordatorios", contract.reminders.toString()); DetailLine(Icons.Default.Info, "Número", contract.id.toString()); if (contract.notes.isNotBlank()) DetailLine(Icons.Default.Info, "Notas", contract.notes) }

@Composable
private fun DetailPage(label: String, title: String, back: () -> Unit, content: @Composable ColumnScope.() -> Unit) = LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 10.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) { item { TextButton(back) { Icon(Icons.Default.ArrowBack, null); Text("Volver") } }; item { Text(label, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp)); Text(title, fontSize = 28.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(horizontal = 6.dp, vertical = 12.dp)) }; item { Card(modifier = Modifier.fillMaxWidth(), shape = RoundedCornerShape(20.dp)) { Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(20.dp), content = content) } } }

@Composable
private fun DetailLine(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, value: String) = Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) { Box(Modifier.size(44.dp).background(MaterialTheme.colorScheme.primaryContainer, CircleShape), contentAlignment = Alignment.Center) { Icon(icon, null, tint = MaterialTheme.colorScheme.primary) }; Column(Modifier.weight(1f).padding(start = 14.dp)) { Text(label, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant); Text(value, fontWeight = FontWeight.SemiBold, fontSize = 16.sp) } }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ConversationScreen(state: AppState, vm: AppViewModel) {
    val activePhone = state.activeChat?.phone.orEmpty()
    val lookupDigits = activePhone.filter(Char::isDigit)
    val existingClient = state.clients.firstOrNull { client ->
        val clientDigits = client.phone.filter(Char::isDigit)
        clientDigits.isNotBlank() && lookupDigits.isNotBlank() && (clientDigits == lookupDigits || clientDigits.endsWith(lookupDigits.takeLast(8)) || lookupDigits.endsWith(clientDigits.takeLast(8)))
    }
    var creatingClient by remember(activePhone) { mutableStateOf(false) }
    var viewingClient by remember(activePhone) { mutableStateOf(false) }
    var editingClient by remember(activePhone) { mutableStateOf(false) }

    if (editingClient && existingClient != null) {
        BackHandler { editingClient = false }
        ClientEditor(existingClient, { editingClient = false }) { client -> vm.saveClient(client) { editingClient = false; viewingClient = false } }
        return
    }

    if (viewingClient && existingClient != null) {
        BackHandler { viewingClient = false }
        ClientDetail(existingClient, { viewingClient = false }, { editingClient = true }, vm::resendClientAccess)
        return
    }

    if (creatingClient) {
        BackHandler { creatingClient = false }
        ClientEditor(
            ClientItem(0, "", activePhone, "", "active", "Cliente creado desde una conversación de WhatsApp.", 0, 0, 0),
            { creatingClient = false },
        ) { client -> vm.saveClient(client) { creatingClient = false } }
        return
    }

    BackHandler { vm.closeChat() }
    val context = LocalContext.current
    var draft by remember { mutableStateOf("") }
    var photo by remember { mutableStateOf<PhotoAttachment?>(null) }
    var showQuickReplies by remember { mutableStateOf(false) }
    var showEmojis by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    var addingQuickReply by remember { mutableStateOf(false) }
    var quickTitle by remember { mutableStateOf("") }
    var quickBody by remember { mutableStateOf("") }
    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
            if (bytes != null && bytes.size <= 10 * 1024 * 1024) {
                var filename = "imagen.jpg"
                context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                    if (cursor.moveToFirst()) filename = cursor.getString(0) ?: filename
                }
                photo = PhotoAttachment(filename, context.contentResolver.getType(uri) ?: "image/jpeg", Base64.encodeToString(bytes, Base64.NO_WRAP))
            }
        }
    }
    val listState = rememberLazyListState()
    LaunchedEffect(state.activeChat?.phone) {
        while (state.activeChat != null) {
            delay(2_000)
            vm.refreshActiveChat()
        }
    }
    LaunchedEffect(state.activeChat?.phone, state.messages.size) { if (state.messages.isNotEmpty()) listState.scrollToItem(state.messages.lastIndex) }
    Scaffold(
        topBar = { TopAppBar(title = { Column { Text(state.activeChat?.name.orEmpty(), fontWeight = FontWeight.Bold); Text(state.activeChat?.phone.orEmpty(), fontSize = 12.sp) } }, navigationIcon = { IconButton(vm::closeChat) { Icon(Icons.Default.ArrowBack, "Volver") } }, actions = { IconButton({ if (existingClient == null) creatingClient = true else viewingClient = true }) { Icon(if (existingClient == null) Icons.Default.Add else Icons.Default.Person, if (existingClient == null) "Crear cliente" else "Ver cliente") }; IconButton({ confirmDelete = true }) { Icon(Icons.Default.Delete, "Eliminar chat", tint = MaterialTheme.colorScheme.error) } }) },
        bottomBar = {
            Column(Modifier.navigationBarsPadding().padding(horizontal = 10.dp, vertical = 8.dp)) {
                photo?.let { attachment ->
                    Surface(color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(14.dp), modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
                        Row(Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.Add, null, tint = MaterialTheme.colorScheme.primary); Text(attachment.filename, Modifier.weight(1f).padding(horizontal = 10.dp), maxLines = 1, overflow = TextOverflow.Ellipsis); IconButton({ photo = null }) { Icon(Icons.Default.Close, "Quitar foto") } }
                    }
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton({ photoPicker.launch("image/*") }, enabled = !state.loading, modifier = Modifier.size(48.dp)) { Icon(Icons.Default.Add, "Adjuntar foto", tint = MaterialTheme.colorScheme.primary) }
                    IconButton({ showQuickReplies = true }, enabled = !state.loading, modifier = Modifier.size(48.dp)) { Icon(Icons.Default.Edit, "Respuestas rápidas", tint = MaterialTheme.colorScheme.primary) }
                    IconButton({ showEmojis = true }, enabled = !state.loading, modifier = Modifier.size(48.dp)) { Text("😊", fontSize = 22.sp) }
                    OutlinedTextField(draft, { draft = it }, Modifier.weight(1f), placeholder = { Text(if (photo == null) "Mensaje" else "Descripción opcional") }, shape = RoundedCornerShape(24.dp), maxLines = 4)
                    Spacer(Modifier.width(8.dp))
                    FilledIconButton({
                        val selectedPhoto = photo
                        if (selectedPhoto != null) vm.sendPhoto(draft, selectedPhoto) { draft = ""; photo = null }
                        else vm.sendMessage(draft) { draft = "" }
                    }, enabled = (draft.isNotBlank() || photo != null) && !state.loading, modifier = Modifier.size(52.dp)) { Icon(Icons.Default.Send, "Enviar") }
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding).fillMaxSize()) {
            Column(Modifier.fillMaxSize()) {
                Card(
                        onClick = { if (existingClient == null) creatingClient = true else viewingClient = true },
                        modifier = Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 10.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                    ) {
                        Row(Modifier.fillMaxWidth().padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Person, null, tint = MaterialTheme.colorScheme.primary)
                            Column(Modifier.weight(1f).padding(horizontal = 12.dp)) {
                                Text(if (existingClient == null) "Crear cliente desde este chat" else "Cliente ya asociado", fontWeight = FontWeight.Bold)
                                Text(existingClient?.name ?: activePhone, fontSize = 12.sp, color = MaterialTheme.colorScheme.onPrimaryContainer)
                            }
                            Icon(if (existingClient == null) Icons.Default.Add else Icons.Default.ArrowForward, if (existingClient == null) "Crear cliente" else "Ver cliente", tint = MaterialTheme.colorScheme.primary)
                        }
                }
                LazyColumn(Modifier.fillMaxWidth().weight(1f), state = listState, contentPadding = PaddingValues(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (state.messages.isEmpty() && !state.loading) item { Text("No hay mensajes", Modifier.fillMaxWidth().padding(24.dp), textAlign = TextAlign.Center, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    items(state.messages) { MessageBubble(it) }
                }
            }
            if (state.loading) LinearProgressIndicator(Modifier.fillMaxWidth())
            state.error?.let { ErrorBanner(it, vm::clearError, Modifier.align(Alignment.BottomCenter)) }
        }
    }

    if (showQuickReplies) AlertDialog(
        onDismissRequest = { showQuickReplies = false },
        title = { Text("Respuestas rápidas") },
        text = {
            LazyColumn(Modifier.fillMaxWidth().heightIn(max = 430.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                items(state.quickReplies) { reply ->
                    Card(onClick = { draft = reply.body; showQuickReplies = false }, modifier = Modifier.fillMaxWidth()) {
                        Column(Modifier.padding(14.dp)) { Text(reply.title, fontWeight = FontWeight.Bold); Text(reply.body, maxLines = 2, overflow = TextOverflow.Ellipsis, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    }
                }
                item { OutlinedButton({ showQuickReplies = false; addingQuickReply = true }, Modifier.fillMaxWidth()) { Icon(Icons.Default.Add, null); Spacer(Modifier.width(8.dp)); Text("Agregar respuesta") } }
            }
        },
        confirmButton = { TextButton({ showQuickReplies = false }) { Text("Cerrar") } },
    )
    if (showEmojis) AlertDialog(
        onDismissRequest = { showEmojis = false },
        title = { Text("Elegir emoji") },
        text = { Column { ChatEmojis.chunked(5).forEach { row -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) { row.forEach { emoji -> TextButton({ draft += emoji; showEmojis = false }, modifier = Modifier.size(52.dp)) { Text(emoji, fontSize = 26.sp) } } } } } },
        confirmButton = { TextButton({ showEmojis = false }) { Text("Cerrar") } },
    )
    if (confirmDelete) AlertDialog(
        onDismissRequest = { confirmDelete = false },
        title = { Text("Eliminar conversación") },
        text = { Text("Se borrará el historial de este chat. El cliente, sus contratos y pagos se conservarán.") },
        confirmButton = { TextButton({ confirmDelete = false; vm.deleteActiveChat {} }, colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error)) { Text("Eliminar") } },
        dismissButton = { TextButton({ confirmDelete = false }) { Text("Cancelar") } },
    )
    if (addingQuickReply) AlertDialog(
        onDismissRequest = { addingQuickReply = false },
        title = { Text("Nueva respuesta rápida") },
        text = { Column(verticalArrangement = Arrangement.spacedBy(12.dp)) { OutlinedTextField(quickTitle, { quickTitle = it }, Modifier.fillMaxWidth(), label = { Text("Nombre") }, singleLine = true); OutlinedTextField(quickBody, { quickBody = it }, Modifier.fillMaxWidth(), label = { Text("Mensaje") }, minLines = 4, maxLines = 8) } },
        confirmButton = { TextButton({ vm.addQuickReply(quickTitle, quickBody) { addingQuickReply = false; quickTitle = ""; quickBody = "" } }, enabled = quickTitle.isNotBlank() && quickBody.isNotBlank() && !state.loading) { Text("Guardar") } },
        dismissButton = { TextButton({ addingQuickReply = false }) { Text("Cancelar") } },
    )
}

@Composable
private fun MessageBubble(message: ChatMessageItem) {
    val outbound = message.direction == "outbound"
    val bitmap = remember(message.id, message.imageData) { decodeChatImage(message.imageData) }
    var expanded by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth(), horizontalArrangement = if (outbound) Arrangement.End else Arrangement.Start) {
        Surface(color = if (outbound) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceContainer, shape = RoundedCornerShape(18.dp), tonalElevation = 1.dp, modifier = Modifier.widthIn(max = 310.dp)) {
            Column(Modifier.padding(if (bitmap != null) 5.dp else 12.dp)) {
                bitmap?.let {
                    Image(it.asImageBitmap(), "Imagen del chat", Modifier.fillMaxWidth().heightIn(min = 150.dp, max = 300.dp).clickable { expanded = true }, contentScale = ContentScale.Crop)
                }
                if (message.body.isNotBlank()) Text(message.body, color = if (outbound) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface, modifier = Modifier.padding(if (bitmap != null) 8.dp else 0.dp))
                if (bitmap == null && message.body.isBlank()) Text("Adjunto", color = if (outbound) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface)
                Row(
                    Modifier.align(Alignment.End).padding(horizontal = 8.dp, vertical = 4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(message.sentAt.substringAfter("T", message.sentAt).take(5), fontSize = 10.sp, color = if (outbound) MaterialTheme.colorScheme.onPrimary.copy(alpha = .72f) else MaterialTheme.colorScheme.onSurfaceVariant)
                    if (outbound) {
                        Spacer(Modifier.width(4.dp))
                        Text(
                            when (message.status) {
                                "read" -> "✓✓"
                                "delivered" -> "✓✓"
                                "sent" -> "✓"
                                "queued" -> "◷"
                                "failed" -> "!"
                                else -> "✓"
                            },
                            fontSize = 11.sp,
                            color = if (message.status == "read") Color(0xFF53BDEB) else MaterialTheme.colorScheme.onPrimary.copy(alpha = .78f),
                        )
                    }
                }
            }
        }
    }
    if (expanded && bitmap != null) Dialog(onDismissRequest = { expanded = false }) {
        Surface(color = Color.Black, shape = RoundedCornerShape(18.dp), modifier = Modifier.fillMaxWidth().clickable { expanded = false }) {
            Image(bitmap.asImageBitmap(), "Imagen ampliada", Modifier.fillMaxWidth().heightIn(min = 280.dp, max = 650.dp), contentScale = ContentScale.Fit)
        }
    }
}

private fun decodeChatImage(encoded: String): android.graphics.Bitmap? {
    if (encoded.isBlank()) return null
    return runCatching {
        val clean = encoded.substringAfter("base64,", encoded)
        val bytes = Base64.decode(clean, Base64.DEFAULT)
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
        var sample = 1
        while (bounds.outWidth / sample > 1200 || bounds.outHeight / sample > 1200) sample *= 2
        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, BitmapFactory.Options().apply { inSampleSize = sample })
    }.getOrNull()
}

@Composable
private fun ChatRow(chat: ChatItem, onClick: () -> Unit) = Card(onClick, Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) { Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) { Avatar(chat.name, Icons.Default.Person); Column(Modifier.weight(1f).padding(horizontal = 14.dp)) { Text(chat.name, fontWeight = FontWeight.Bold, maxLines = 1); Text(chat.preview, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis) }; if (chat.unread > 0) Badge { Text(chat.unread.toString()) }; Icon(Icons.Default.ArrowForward, null, tint = MaterialTheme.colorScheme.onSurfaceVariant) } }

@Composable
private fun Avatar(name: String, icon: androidx.compose.ui.graphics.vector.ImageVector) = Box(Modifier.size(48.dp).background(MaterialTheme.colorScheme.primaryContainer, CircleShape), contentAlignment = Alignment.Center) { if (name.isNotBlank()) Text(name.take(1).uppercase(), color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold) else Icon(icon, null, tint = MaterialTheme.colorScheme.primary) }

@Composable
private fun MoreScreen(state: AppState, vm: AppViewModel) {
    var module by remember { mutableStateOf<String?>(null) }
    if (module != null) {
        BackHandler { module = null }
        when (module) {
            "Recordatorios" -> RemindersModule(state.reminders) { module = null }
            "Contabilidad" -> AccountingModule(state) { module = null }
            "Configuración" -> SettingsModule(state, vm) { module = null }
            "Sistema" -> SystemSettingsModule(state, vm) { module = null }
            "Perfil" -> ProfileModule(state, vm) { module = null }
            "Usuarios" -> UsersModule(state.users, vm::updateUserRole) { module = null }
        }
        return
    }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        item { EntityCard(state.user?.name.orEmpty(), state.user?.email.orEmpty(), "Perfil", Icons.Default.Person) { module = "Perfil" } }
        items(listOf("Recordatorios", "Contabilidad", "Configuración")) { label -> ModuleCard(label) { module = label } }
        if (state.user?.isAdmin == true) {
            item { ModuleCard("Configuración del sistema") { module = "Sistema" } }
            item { ModuleCard("Usuarios") { module = "Usuarios" } }
        }
        item { OutlinedButton(vm::logout, Modifier.fillMaxWidth().height(54.dp)) { Icon(Icons.Default.ArrowBack, null); Spacer(Modifier.width(8.dp)); Text("Cerrar sesión") } }
    }
}

@Composable
private fun ModuleCard(label: String, onClick: () -> Unit) = Card(onClick, Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) { Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.Info, null, tint = MaterialTheme.colorScheme.primary); Text(label, Modifier.weight(1f).padding(start = 14.dp), fontWeight = FontWeight.SemiBold); Icon(Icons.Default.ArrowForward, null) } }

@Composable
private fun PaymentsModule(payments: List<PaymentItem>, back: () -> Unit) = ModulePage("Pagos", back) { items(payments) { payment -> EntityCard(payment.client, "${payment.currency} ${payment.amount} · ${payment.channel}", payment.status, Icons.Default.Info) {} } }

@Composable
private fun RemindersModule(reminders: List<ReminderItem>, back: () -> Unit) = ModulePage("Recordatorios", back) { items(reminders) { reminder -> EntityCard(reminder.client, "${reminder.channel} · ${reminder.scheduledFor}", reminder.status, Icons.Default.Info) {} } }

@Composable
private fun AccountingModule(state: AppState, back: () -> Unit) = ModulePage("Contabilidad", back) {
    val finance = state.finance
    if (finance == null) {
        item { EmptyState("No se pudo cargar la información financiera") }
    } else {
        item { Text("Centro financiero · ${finance.period}", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.SemiBold) }
        item { FinanceAmountCard("Cartera activa total", finance.contracted, "${crc(finance.future)} vence después de este mes") }
        item { FinanceAmountCard("Conciliado este mes", finance.verified, "${finance.verifiedCount} pagos verificados") }
        item { FinanceAmountCard("Por cobrar hasta fin de mes", finance.pending, "${crc(finance.dueThisMonth)} vence este mes") }
        item { FinanceAmountCard("Por revisar", finance.inReview, "${finance.reviewCount} movimientos requieren atención") }
        item { Text("Movimientos recientes", fontSize = 18.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 8.dp)) }
        items(state.payments.take(20)) { payment ->
            EntityCard(payment.client, "${payment.currency} ${payment.amount} · ${payment.channel}", payment.status, Icons.Default.Info) {}
        }
    }
}

private fun crc(value: Double) = "₡" + String.format(java.util.Locale.US, "%,.2f", value)

@Composable
private fun FinanceAmountCard(title: String, amount: Double, detail: String) =
    Card(Modifier.fillMaxWidth(), shape = RoundedCornerShape(18.dp)) {
        Column(Modifier.padding(18.dp)) {
            Text(title, color = MaterialTheme.colorScheme.onSurfaceVariant)
            Text(crc(amount), fontSize = 26.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(vertical = 5.dp))
            Text(detail, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }

@Composable
private fun ProfileModule(state: AppState, vm: AppViewModel, back: () -> Unit) {
    var name by remember(state.user) { mutableStateOf(state.user?.name.orEmpty()) }; var email by remember(state.user) { mutableStateOf(state.user?.email.orEmpty()) }
    ModulePage("Perfil", back) { item { OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text("Nombre") }, singleLine = true); Spacer(Modifier.height(12.dp)); OutlinedTextField(email, { email = it }, Modifier.fillMaxWidth(), label = { Text("Correo") }, singleLine = true); if (!state.user?.phone.isNullOrBlank()) { Spacer(Modifier.height(12.dp)); DetailLine(Icons.Default.Info, "Teléfono", state.user?.phone.orEmpty()) }; Spacer(Modifier.height(18.dp)); Button({ vm.updateProfile(name, email, back) }, Modifier.fillMaxWidth().height(52.dp), enabled = name.isNotBlank() && email.isNotBlank() && !state.loading) { Text("Guardar cambios") } } }
}

@Composable
private fun SettingsModule(state: AppState, vm: AppViewModel, back: () -> Unit) {
    val context = LocalContext.current; val activity = context as FragmentActivity; val biometricAvailable = remember { BiometricAuthenticator.isAvailable(context) }
    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { vm.setNotificationsEnabled(it) }
    ModulePage("Configuración", back) {
        item { SettingToggle("Modo oscuro", "Usar colores cómodos de noche", state.darkMode, vm::setDarkMode) }
        item { SettingToggle("Notificaciones", "Avisos de chats y recordatorios", state.notificationsEnabled, { enabled -> if (!enabled) vm.setNotificationsEnabled(false) else if (Build.VERSION.SDK_INT >= 33) notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS) else vm.setNotificationsEnabled(true) }) }
        item { SettingToggle("Huella o biometría", if (biometricAvailable) "Proteger el acceso a la app" else "Configurá una huella en Android primero", state.biometricEnabled, { enabled -> if (!enabled) vm.setBiometricEnabled(false) else BiometricAuthenticator.authenticate(activity, { vm.setBiometricEnabled(true) }, {}) }, biometricAvailable) }
    }
}

@Composable
private fun SystemSettingsModule(state: AppState, vm: AppViewModel, back: () -> Unit) {
    val current = state.systemSettings
    if (current == null) {
        ModulePage("Configuración del sistema", back) { item { EmptyState("No se pudo cargar la configuración") } }
        return
    }
    var companyName by remember(current) { mutableStateOf(current.companyName) }
    var serviceName by remember(current) { mutableStateOf(current.serviceName) }
    var paymentContact by remember(current) { mutableStateOf(current.paymentContact) }
    var beneficiaryName by remember(current) { mutableStateOf(current.beneficiaryName) }
    var bankAccounts by remember(current) { mutableStateOf(current.bankAccounts) }
    var reminderTemplate by remember(current) { mutableStateOf(current.reminderTemplate) }
    ModulePage("Configuración del sistema", back) {
        item {
            Text("Información general", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(companyName, { companyName = it }, Modifier.fillMaxWidth(), label = { Text("Nombre de la empresa") }, singleLine = true)
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(serviceName, { serviceName = it }, Modifier.fillMaxWidth(), label = { Text("Nombre del servicio") }, singleLine = true)
        }
        item {
            Text("Datos para pagos", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(paymentContact, { paymentContact = it }, Modifier.fillMaxWidth(), label = { Text("Número SINPE") }, singleLine = true)
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(beneficiaryName, { beneficiaryName = it }, Modifier.fillMaxWidth(), label = { Text("Nombre del beneficiario") }, singleLine = true)
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(bankAccounts, { bankAccounts = it }, Modifier.fillMaxWidth(), label = { Text("Cuentas bancarias") }, supportingText = { Text("Una cuenta por línea") }, minLines = 4, maxLines = 8)
        }
        item {
            Text("Recordatorios", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
            Spacer(Modifier.height(10.dp))
            OutlinedTextField(reminderTemplate, { reminderTemplate = it }, Modifier.fillMaxWidth(), label = { Text("Plantilla de recordatorio") }, minLines = 5, maxLines = 10)
        }
        item {
            Button({ vm.updateSystemSettings(SystemSettings(companyName, serviceName, paymentContact, beneficiaryName, bankAccounts, reminderTemplate), back) }, Modifier.fillMaxWidth().height(54.dp), enabled = !state.loading) {
                Icon(Icons.Default.Settings, null); Spacer(Modifier.width(8.dp)); Text("Guardar configuración")
            }
            Text("Las cuentas y el SINPE se actualizarán también en la respuesta rápida de pagos.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(top = 10.dp))
        }
    }
}

@Composable
private fun UsersModule(users: List<UserItem>, updateRole: (UserItem, String) -> Unit, back: () -> Unit) = ModulePage("Usuarios", back) { items(users) { user -> Card(Modifier.fillMaxWidth()) { Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) { Avatar(user.name, Icons.Default.Person); Column(Modifier.weight(1f).padding(horizontal = 12.dp)) { Text(user.name, fontWeight = FontWeight.Bold); Text(user.email, color = MaterialTheme.colorScheme.onSurfaceVariant) }; AssistChip({ updateRole(user, if (user.role == "admin") "agent" else "admin") }, { Text(if (user.role == "admin") "Admin" else "Agente") }) } } } }

@Composable
private fun ModulePage(title: String, back: () -> Unit, content: LazyListScope.() -> Unit) = LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { item { TextButton(back) { Icon(Icons.Default.ArrowBack, null); Text("Volver") }; Text(title, fontSize = 28.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(8.dp)) }; content() }

@Composable
private fun SettingToggle(title: String, subtitle: String, checked: Boolean, onChecked: (Boolean) -> Unit, enabled: Boolean = true) = Card(Modifier.fillMaxWidth()) { Row(Modifier.padding(18.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.Settings, null, tint = MaterialTheme.colorScheme.primary); Column(Modifier.weight(1f).padding(start = 14.dp)) { Text(title, fontWeight = FontWeight.SemiBold); Text(subtitle, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }; Switch(checked, onChecked, enabled = enabled) } }

@Composable private fun EmptyState(text: String) = Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text(text, color = Color.Gray) }
@Composable private fun ErrorBanner(text: String, close: () -> Unit, modifier: Modifier = Modifier) = Surface(modifier.padding(12.dp), color = MaterialTheme.colorScheme.errorContainer, shape = RoundedCornerShape(14.dp)) { Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) { Text(text, Modifier.weight(1f), color = MaterialTheme.colorScheme.onErrorContainer); IconButton(close) { Icon(Icons.Default.Close, "Cerrar") } } }
@Composable private fun NoticeBanner(text: String, close: () -> Unit, modifier: Modifier = Modifier) = Surface(modifier.padding(12.dp), color = MaterialTheme.colorScheme.primaryContainer, shape = RoundedCornerShape(14.dp)) { Row(Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Default.CheckCircle, null, tint = MaterialTheme.colorScheme.primary); Spacer(Modifier.width(10.dp)); Text(text, Modifier.weight(1f), color = MaterialTheme.colorScheme.onPrimaryContainer); IconButton(close) { Icon(Icons.Default.Close, "Cerrar") } } }
